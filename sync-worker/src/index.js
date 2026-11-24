// Atlas sync service: a Cloudflare Worker that keeps one encrypted copy per sync code, in D1.
//
// It stores, per vault: a hash of the access key, a revision number and the locked data. It cannot read
// the data (the encryption key never leaves your devices; see js/sync-crypto.js in the app), and it does
// not know who you are: there are no accounts, emails or tracking, and it keeps no request logs of its own.
//
// API (JSON):
//   GET    /v1/vaults/:id   → 200 { rev, blob }, or 200 { rev: 0, blob: null } when there is no copy yet
//   PUT    /v1/vaults/:id   body { blob }, header If-Match: <rev it was based on> (0 for a new vault)
//                           → 200 { rev } | 409 when another device uploaded first (download, merge, retry)
//   DELETE /v1/vaults/:id   → 200 { deleted: true }
//   GET    /health          → 200 { ok: true }
// Every vault call needs "Authorization: Bearer <access key>". The first upload sets the access key.

const ID_RE = /^[0-9a-f]{32}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
/** D1 rows can be up to 2,000,000 bytes; keep a margin for the other columns. */
export const MAX_BLOB_CHARS = 1_900_000;

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const local = env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!allowed.includes(origin) && !local) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cors },
  });
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two strings in time that does not depend on where they differ. */
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearer(request) {
  const m = (request.headers.get('Authorization') ?? '').match(/^Bearer ([A-Za-z0-9_-]+)$/);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

async function readBlob(request) {
  const declared = Number(request.headers.get('Content-Length') ?? 0);
  if (declared > MAX_BLOB_CHARS + 1000) return { tooLarge: true };
  const text = await request.text();
  if (text.length > MAX_BLOB_CHARS + 1000) return { tooLarge: true };
  let body;
  try { body = JSON.parse(text); } catch { return { bad: 'The body must be JSON.' }; }
  if (!body || typeof body.blob !== 'string' || !body.blob) return { bad: 'The body needs a "blob" string.' };
  if (body.blob.length > MAX_BLOB_CHARS) return { tooLarge: true };
  return { blob: body.blob };
}

async function handleVault(request, env, id, cors) {
  const token = bearer(request);
  if (!token) return json({ error: 'An access key is required.' }, 401, cors);
  const authHash = await sha256Hex(token);
  const row = await env.DB.prepare('SELECT auth_hash, rev, blob FROM vaults WHERE id = ?').bind(id).first();

  if (request.method === 'GET') {
    if (!row) return json({ rev: 0, blob: null }, 200, cors); // not an error: the first device has not uploaded yet
    if (!sameText(row.auth_hash, authHash)) return json({ error: 'That access key is not valid for this vault.' }, 403, cors);
    return json({ rev: row.rev, blob: row.blob }, 200, cors);
  }

  if (request.method === 'PUT') {
    if (row && !sameText(row.auth_hash, authHash)) return json({ error: 'That access key is not valid for this vault.' }, 403, cors);
    const ifMatch = Number.parseInt(request.headers.get('If-Match') ?? '', 10);
    if (!Number.isInteger(ifMatch) || ifMatch < 0) return json({ error: 'If-Match must give the revision this upload is based on (0 for a new vault).' }, 428, cors);
    const body = await readBlob(request);
    if (body.tooLarge) return json({ error: 'Too large.' }, 413, cors);
    if (body.bad) return json({ error: body.bad }, 400, cors);
    const now = Date.now();
    if (!row) {
      if (ifMatch !== 0) return json({ error: 'There is no copy to update.' }, 409, cors);
      const r = await env.DB.prepare('INSERT INTO vaults (id, auth_hash, rev, blob, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
        .bind(id, authHash, body.blob, now, now).run();
      if (!r.meta?.changes) return json({ error: 'Another device created this copy first.' }, 409, cors);
      return json({ rev: 1 }, 200, cors);
    }
    // Only replaces the copy this upload was based on, so two devices can never overwrite each other.
    const r = await env.DB.prepare('UPDATE vaults SET blob = ?, rev = rev + 1, updated_at = ? WHERE id = ? AND rev = ? AND auth_hash = ?')
      .bind(body.blob, now, id, ifMatch, authHash).run();
    if (!r.meta?.changes) return json({ error: 'Another device uploaded first.', rev: row.rev }, 409, cors);
    return json({ rev: ifMatch + 1 }, 200, cors);
  }

  if (request.method === 'DELETE') {
    if (!row) return json({ deleted: true }, 200, cors);
    if (!sameText(row.auth_hash, authHash)) return json({ error: 'That access key is not valid for this vault.' }, 403, cors);
    await env.DB.prepare('DELETE FROM vaults WHERE id = ? AND auth_hash = ?').bind(id, authHash).run();
    return json({ deleted: true }, 200, cors);
  }

  return json({ error: 'Method not allowed.' }, 405, cors);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/health') return json({ ok: true }, 200, cors);
      const m = pathname.match(/^\/v1\/vaults\/([^/]+)$/);
      if (!m) return json({ error: 'Not found.' }, 404, cors);
      if (!ID_RE.test(m[1])) return json({ error: 'Not a vault id.' }, 400, cors);
      return await handleVault(request, env, m[1], cors);
    } catch (err) {
      const limit = /limit|exceeded/i.test(String(err?.message));
      return json({ error: limit ? 'The free daily limit is used up. Try again after midnight UTC.' : 'Something went wrong.' }, limit ? 429 : 500, cors);
    }
  },
};
