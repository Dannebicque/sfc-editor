import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/500.css';
import './landing.css';

// La langue de la page choisie devient celle de l'éditeur (même clé que l'éditeur : voir packages/editor/src/i18n.ts).
const LANG_KEY = 'grafcet-studio-v1-lang';
const PROJECT_KEY = 'grafcet-studio-v1';
let returning = false;
try { returning = !!localStorage.getItem(PROJECT_KEY); } catch { /* stockage indisponible */ }

document.querySelectorAll<HTMLAnchorElement>('a[data-cta]').forEach((a) => {
  a.addEventListener('click', () => { try { localStorage.setItem(LANG_KEY, document.documentElement.lang); } catch { /* ignoré */ } });
  // Quelqu'un qui a déjà un projet local n'a pas besoin d'« essayer » : on lui propose de le reprendre.
  if (returning && a.dataset.resume) a.textContent = a.dataset.resume;
});

// Compteur anonyme (un nom d'événement, rien d'autre) ; sans serveur, l'échec est ignoré.
const beacon = (event: string): void => {
  try { void fetch('/api/usage', { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }) }).catch(() => undefined); } catch { /* ignoré */ }
};
document.querySelectorAll<HTMLAnchorElement>('a[data-event]').forEach((a) => a.addEventListener('click', () => beacon(a.dataset.event!)));

// Liste d'attente de l'offre à venir.
document.querySelectorAll<HTMLFormElement>('form[data-waitlist]').forEach((form) => {
  const msg = form.querySelector<HTMLElement>('.wait-msg')!;
  const say = (k: 'ok' | 'invalid' | 'error' | 'rate', cls: string): void => { msg.textContent = msg.dataset[k] ?? ''; msg.className = 'wait-msg ' + cls; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const email = String(f.get('email') ?? '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || f.get('consent') !== 'on') { say('invalid', 'err'); return; }
    const btn = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    btn.disabled = true;
    try {
      const r = await fetch('/api/waitlist', { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, kind: f.get('kind'), locale: form.dataset.lang, consent: true }) });
      if (r.ok) { say('ok', 'ok'); form.reset(); } else say(r.status === 429 ? 'rate' : r.status === 400 ? 'invalid' : 'error', 'err');
    } catch { say('error', 'err'); }
    btn.disabled = false;
  });
});
