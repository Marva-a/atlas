// Sync encryption. Your sync code is a random secret that only your devices know. From it, each device
// works out three things with HKDF (a standard way to turn one secret into several independent keys):
//   - the vault id: which copy on the sync service is yours;
//   - the access key: proves to the service that you may read and replace that copy;
//   - the encryption key: locks the copy with AES-GCM before it leaves your device.
// The service only ever sees the vault id, a hash of the access key and locked data. It cannot read
// your progress, and neither can anyone who only has the service's data.
//
// Uses the browser's built-in Web Crypto, so nothing is added to the app. Works in Node 20+ for checks.

const enc = new TextEncoder();
const dec = new TextDecoder();
const SALT = enc.encode('atlas-sync-v1');
export const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;

function toB64(bytes) {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}
function fromB64(text) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const toB64url = (bytes) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (text) => fromB64(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A new sync code: 32 random bytes (256 bits), written in 43 URL-safe characters. */
export function newSecret() {
  return toB64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Tidies a code typed or pasted by hand (spaces, dashes between groups, a whole link). Returns '' if unusable. */
export function cleanSecret(input) {
  const text = String(input ?? '').trim();
  const fromLink = text.match(/#pair\/([A-Za-z0-9_-]{43})/);
  if (fromLink) return fromLink[1];
  const bare = text.replace(/\s+/g, '');
  return SECRET_RE.test(bare) ? bare : '';
}

/** The code split into groups of five, easier to read aloud or type. */
export function groupedSecret(secret) {
  return secret.match(/.{1,5}/g).join(' ');
}

/** Works out the vault id, access key and encryption key from a sync code. */
export async function deriveKeys(secret) {
  if (!SECRET_RE.test(secret)) throw new Error('That is not a valid sync code.');
  const base = await crypto.subtle.importKey('raw', fromB64url(secret), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const params = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode(info) });
  const vaultId = toHex(new Uint8Array(await crypto.subtle.deriveBits(params('vault-id'), base, 128)));
  const authToken = toB64url(new Uint8Array(await crypto.subtle.deriveBits(params('access-key'), base, 256)));
  const key = await crypto.subtle.deriveKey(params('encryption-key'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return { vaultId, authToken, key };
}

async function gzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Locks a sync state for upload: JSON, compressed where the browser can, then AES-GCM with a fresh
 * random nonce. The vault id is bound in as extra data, so a locked copy cannot be moved to another vault.
 */
export async function sealState(state, keys) {
  let bytes = enc.encode(JSON.stringify(state));
  let z = 'none';
  if (typeof CompressionStream === 'function') {
    bytes = await gzip(bytes);
    z = 'gzip';
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(keys.vaultId) }, keys.key, bytes));
  return JSON.stringify({ v: 1, z, iv: toB64(iv), ct: toB64(ct) });
}

/** Unlocks a copy made by sealState. Throws if the code is wrong or the copy was changed. */
export async function openState(text, keys) {
  const env = JSON.parse(text);
  if (!env || env.v !== 1 || typeof env.iv !== 'string' || typeof env.ct !== 'string') throw new Error('The synced copy is not in a format this version of Atlas knows.');
  const plain = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(env.iv), additionalData: enc.encode(keys.vaultId) }, keys.key, fromB64(env.ct),
  ));
  if (env.z === 'gzip') {
    if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot unpack the synced copy. Update the browser and try again.');
    return JSON.parse(dec.decode(await gunzip(plain)));
  }
  return JSON.parse(dec.decode(plain));
}
