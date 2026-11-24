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

// ─── Pairing with a short code ───────────────────────────────────────────────
const PID = 'b'.repeat(64);
const pair = (method, { body, answer = false, id = PID } = {}) => worker.fetch(new Request(`https://sync.test/v1/pairings/${id}${answer ? '/answer' : ''}`, {
  method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined,
}), env);
check('Pairing: an unknown code is "not found", not an error', (await (await pair('GET')).json()).found, false);
check('Pairing: a bad id is refused', (await pair('GET', { id: 'xyz' })).status, 400);
r = await pair('PUT', { body: { pub: 'PUBKEY' } });
check('Pairing: showing a code creates it', r.status, 200);
check('Pairing: the same code cannot be created twice', (await pair('PUT', { body: { pub: 'OTHER' } })).status, 409);
let pr = await (await pair('GET')).json();
check('Pairing: the other device reads the public key', pr.pub, 'PUBKEY');
check('Pairing: no answer yet', pr.sealed, null);
check('Pairing: an answer without "sealed" is refused', (await pair('POST', { answer: true, body: { nope: 1 } })).status, 400);
check('Pairing: answering works once', (await pair('POST', { answer: true, body: { sealed: 'SEALED' } })).status, 200);
check('Pairing: a second answer is refused', (await pair('POST', { answer: true, body: { sealed: 'EVIL' } })).status, 409);
pr = await (await pair('GET')).json();
check('Pairing: the showing device gets the first answer', pr.sealed, 'SEALED');
check('Pairing: delete after use', (await pair('DELETE')).status, 200);
check('Pairing: gone after delete', (await (await pair('GET')).json()).found, false);
env.DB.raw.prepare('INSERT INTO pairings (id, pub, sealed, created_at, expires_at) VALUES (?, ?, NULL, ?, ?)').run('c'.repeat(64), 'OLD', 1, 2);
check('Pairing: an expired code reads as not found', (await (await pair('GET', { id: 'c'.repeat(64) })).json()).found, false);
check('Pairing: an expired code cannot be answered', (await pair('POST', { id: 'c'.repeat(64), answer: true, body: { sealed: 'S' } })).status, 404);
await pair('PUT', { id: 'd'.repeat(64), body: { pub: 'NEW' } });
check('Pairing: expired codes are tidied up when a new one is made', env.DB.raw.prepare('SELECT COUNT(*) AS n FROM pairings WHERE id = ?').get('c'.repeat(64)).n, 0);
r = await worker.fetch(new Request(`https://sync.test/v1/pairings/${PID}/answer`, { method: 'OPTIONS', headers: { Origin: 'https://marva-a.github.io' } }), env);
check('Pairing: the Atlas site may POST from a browser', /POST/.test(r.headers.get('Access-Control-Allow-Methods') ?? ''), true);

for (const x of results) console.log(`${x.pass ? 'PASS' : 'FAIL'}  ${x.name}${x.pass ? '' : ` (got ${x.actual}, expected ${x.expected})`}`);
const failed = results.filter((x) => !x.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
