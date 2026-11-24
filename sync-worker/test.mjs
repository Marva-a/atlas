// Checks the sync Worker against a local stand-in for D1. Run: node --no-warnings sync-worker/test.mjs
import worker, { MAX_BLOB_CHARS } from './src/index.js';
import { localD1 } from './dev/local-d1.mjs';

const env = { DB: localD1(), ALLOWED_ORIGINS: 'https://marva-a.github.io', ALLOW_LOCALHOST: 'false' };
const results = [];
const check = (name, actual, expected) => results.push({ name, pass: actual === expected, actual, expected });

const ID = 'a'.repeat(32);
const KEY = 'K'.repeat(43);
const OTHER = 'Z'.repeat(43);
const call = (method, path, { key = KEY, body, ifMatch, origin } = {}) => worker.fetch(new Request(`https://sync.test${path}`, {
  method,
  headers: {
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(ifMatch !== undefined ? { 'If-Match': String(ifMatch) } : {}),
    ...(origin ? { Origin: origin } : {}),
  },
  body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
}), env);

check('Health check answers', (await call('GET', '/health', { key: null })).status, 200);
check('No copy yet: an empty answer, not an error', (await (await call('GET', `/v1/vaults/${ID}`)).json()).blob, null);
check('No access key: 401', (await call('GET', `/v1/vaults/${ID}`, { key: null })).status, 401);
check('A bad vault id: 400', (await call('GET', '/v1/vaults/not-hex')).status, 400);
check('Upload without If-Match: 428', (await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'x' } })).status, 428);

let r = await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'first' }, ifMatch: 0 });
check('First upload creates revision 1', (await r.json()).rev, 1);
r = await call('GET', `/v1/vaults/${ID}`);
const got = await r.json();
check('Download returns the copy', got.blob, 'first');
check('Download returns its revision', got.rev, 1);
check('A different access key cannot read it', (await call('GET', `/v1/vaults/${ID}`, { key: OTHER })).status, 403);
check('A different access key cannot replace it', (await call('PUT', `/v1/vaults/${ID}`, { key: OTHER, body: { blob: 'evil' }, ifMatch: 1 })).status, 403);
check('Creating it again (If-Match 0) is a conflict', (await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'again' }, ifMatch: 0 })).status, 409);

r = await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'second' }, ifMatch: 1 });
check('An upload based on the latest revision succeeds', (await r.json()).rev, 2);
check('An upload based on an old revision is a conflict', (await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'stale' }, ifMatch: 1 })).status, 409);
check('The conflicting upload changed nothing', (await (await call('GET', `/v1/vaults/${ID}`)).json()).blob, 'second');

check('A body that is not JSON: 400', (await call('PUT', `/v1/vaults/${ID}`, { body: 'nope', ifMatch: 2 })).status, 400);
check('Too large: 413', (await call('PUT', `/v1/vaults/${ID}`, { body: { blob: 'x'.repeat(MAX_BLOB_CHARS + 1) }, ifMatch: 2 })).status, 413);

r = await call('OPTIONS', `/v1/vaults/${ID}`, { key: null, origin: 'https://marva-a.github.io' });
check('The Atlas site may call it from a browser', r.headers.get('Access-Control-Allow-Origin'), 'https://marva-a.github.io');
r = await call('OPTIONS', `/v1/vaults/${ID}`, { key: null, origin: 'https://evil.example' });
check('Other sites may not', r.headers.get('Access-Control-Allow-Origin'), null);
r = await call('OPTIONS', `/v1/vaults/${ID}`, { key: null, origin: 'http://localhost:8095' });
check('Localhost is refused unless switched on', r.headers.get('Access-Control-Allow-Origin'), null);

check('A different key cannot delete it', (await call('DELETE', `/v1/vaults/${ID}`, { key: OTHER })).status, 403);
check('Delete with the right key', (await call('DELETE', `/v1/vaults/${ID}`)).status, 200);
check('After deleting: no copy', (await (await call('GET', `/v1/vaults/${ID}`)).json()).blob, null);
const stored = env.DB.raw.prepare('SELECT COUNT(*) AS n FROM vaults').get().n;
check('Nothing is left in the database', stored, 0);

for (const x of results) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.name}${x.pass ? '' : ` (got ${x.actual}, expected ${x.expected})`}`);
const failed = results.filter((x) => !x.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
