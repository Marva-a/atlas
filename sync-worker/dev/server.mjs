// Runs the sync Worker on this computer, with a local SQLite file standing in for D1, so Atlas can be
// tried end to end without a Cloudflare account. Not for production.
//   node --no-warnings sync-worker/dev/server.mjs          (listens on http://127.0.0.1:8787)
// Then, in Atlas opened from localhost, run in the browser console:
//   localStorage.setItem('identity-lab-coach:sync-url', 'http://127.0.0.1:8787')
import { createServer } from 'node:http';
import worker from '../src/index.js';
import { localD1 } from './local-d1.mjs';

const port = Number(process.env.PORT) || 8787;
const env = { DB: localD1(process.env.SYNC_DB || ':memory:'), ALLOWED_ORIGINS: '', ALLOW_LOCALHOST: 'true' };

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${port}${req.url}`, {
    method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, '127.0.0.1', () => console.log(`Atlas sync (local test service) on http://127.0.0.1:${port}`));
