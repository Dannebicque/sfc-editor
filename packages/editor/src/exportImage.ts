/** Export image et PDF : conversion d'un SVG autonome en PNG, et impression (PDF) d'une série de SVG par le navigateur. */

/** Rasterise un SVG en PNG (facteur d'échelle `scale`, fond blanc). */
export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('toBlob'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

const escHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Ouvre la boîte d'impression du navigateur sur un document ne contenant que les dessins (un GRAFCET par page) :
 * « Enregistrer au format PDF » y produit un PDF vectoriel, sans dépendance.
 */
export function printSvgs(title: string, pages: { name: string; svg: string }[], lang: string): void {
  const html = `<!doctype html><html lang="${escHtml(lang)}"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
@page{margin:12mm}
body{margin:0;font:12px system-ui,sans-serif;color:#111}
section{break-after:page;page-break-after:always}
section:last-child{break-after:auto;page-break-after:auto}
h1{font-size:14px;margin:0 0 8px}
svg{display:block;max-width:100%;max-height:250mm;width:auto;height:auto}
</style></head><body>${pages.map((p) => `<section><h1>${escHtml(p.name)}</h1>${p.svg}</section>`).join('')}</body></html>`;
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.onload = () => {
    const w = f.contentWindow;
    if (!w) { f.remove(); return; }
    w.addEventListener('afterprint', () => f.remove());
    w.focus(); w.print();
    setTimeout(() => f.remove(), 60_000);
  };
  f.srcdoc = html;
  document.body.appendChild(f);
}
