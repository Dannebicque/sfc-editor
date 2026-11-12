import { createServer, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { createApp } from './app';
import { FileStore } from './store';

const env = process.env;
const num = (v: string | undefined, d: number): number => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const port = num(env.PORT, 8787), host = env.HOST ?? '127.0.0.1';
const trustProxy = env.TRUST_PROXY === '1';
const store = new FileStore(env.DATA_DIR ?? './data');
const app = createApp({ store, maxBytes: num(env.MAX_BYTES, 2_000_000), ttlDays: num(env.TTL_DAYS, 90), ratePerHour: num(env.RATE_PER_HOUR, 20), allowedOrigin: env.ALLOWED_ORIGIN });

/** Adresse du client : celle de la connexion, ou la dernière de X-Forwarded-For derrière un proxy de confiance. */
const clientIp = (req: IncomingMessage): string => {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1]!;
  }
  return req.socket.remoteAddress ?? 'inconnu';
};

const server = createServer(async (req, res) => {
  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const request = new Request(`http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, Array.isArray(v) ? v.join(', ') : v] as [string, string]])),
      body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
      duplex: 'half',
    } as RequestInit);
    const r = await app(request, { ip: clientIp(req) });
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{"error":"internal"}');
  }
});

setInterval(() => { void store.sweep(Date.now()); }, 3_600_000).unref();
void store.sweep(Date.now());
server.listen(port, host, () => { console.log(`Serveur de partage sur http://${host}:${port} (données : ${env.DATA_DIR ?? './data'})`); });
