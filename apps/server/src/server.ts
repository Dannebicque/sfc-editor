import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { createApp, type Handler } from './app';
import type { Collab } from './collab';

export interface ServerOptions {
  /** Partage par lien (ADR 0004). */
  shares: Handler;
  /** Comptes, projets, rôles (ADR 0005) ; absent : ces routes répondent 404. */
  accounts?: Handler;
  collab?: Collab;
  trustProxy?: boolean;
  /** Dossier de l'éditeur construit (`apps/web/dist`) : servi tel quel, avec repli sur index.html. Absent : API seule. */
  staticDir?: string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
};

/** Fichier statique sûr : le chemin résolu doit rester dans `root`. Renvoie null si introuvable. */
async function serveStatic(root: string, pathname: string): Promise<{ body: Buffer; type: string; cache: string } | null> {
  let rel: string;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes('\0')) return null;
  const tryFile = async (r: string): Promise<{ body: Buffer; type: string; cache: string } | null> => {
    let full = normalize(join(root, r));
    if (full !== root && !full.startsWith(root + sep)) return null;
    try {
      // Un dossier sert son index.html (/app/ → app/index.html, /en/ → en/index.html).
      if ((await stat(full)).isDirectory()) full = join(full, 'index.html');
      if (!(await stat(full)).isFile()) return null;
      const ext = extname(full).toLowerCase();
      // Fichiers à nom haché (assets/…) : cache long ; le reste doit être revalidé (index, service worker, manifeste).
      return { body: await readFile(full), type: MIME[ext] ?? 'application/octet-stream', cache: /^\/?assets\//.test(r) ? 'public, max-age=31536000, immutable' : 'no-cache' };
    } catch { return null; }
  };
  const hit = await tryFile(rel);
  if (hit || extname(rel)) return hit;
  // Repli des routes sans extension sur la page de leur section : l'éditeur (/app/…), la landing anglaise (/en/…), sinon la landing française.
  return tryFile(/^\/app(\/|$)/.test(rel) ? 'app/index.html' : /^\/en(\/|$)/.test(rel) ? 'en/index.html' : 'index.html');
}

export type { Handler };
export { createApp };

/** Adresse du client : celle de la connexion, ou la dernière de X-Forwarded-For derrière un proxy de confiance. */
const clientIp = (req: IncomingMessage, trustProxy: boolean): string => {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1]!;
  }
  return req.socket.remoteAddress ?? 'inconnu';
};

export function buildServer(o: ServerOptions): Server {
  const route = (path: string): Handler | undefined => {
    if (path === '/api/health' || path === '/api/shares' || path.startsWith('/api/shares/')) return o.shares;
    return o.accounts;
  };
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const handler = route(url.pathname.replace(/\/+$/, '') || '/');
      if (o.staticDir && (req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/app' || url.pathname === '/en')) {
        // Les liens relatifs de ces pages supposent la barre finale.
        res.writeHead(301, { Location: url.pathname + '/' + url.search }).end();
        return;
      }
      if (!handler || !url.pathname.startsWith('/api/')) {
        const file = o.staticDir && !url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD') && !url.pathname.startsWith('/ws/') ? await serveStatic(o.staticDir, url.pathname) : null;
        if (file) { res.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': file.cache, 'X-Content-Type-Options': 'nosniff' }).end(req.method === 'HEAD' ? undefined : file.body); return; }
        res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not_found"}');
        return;
      }
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v] as [string, string]])),
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
        duplex: 'half',
      } as RequestInit);
      const r = await handler(request, { ip: clientIp(req, !!o.trustProxy) });
      const headers: Record<string, string | string[]> = {};
      r.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
      const cookies = r.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(r.status, headers);
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"internal"}');
    }
  });
  if (o.collab) {
    const collab = o.collab;
    server.on('upgrade', (req, socket, head) => {
      if (!collab.upgrade(req, socket, head)) { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); socket.destroy(); }
    });
  }
  return server;
}
