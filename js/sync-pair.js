// Connecting a device with a short code, the way you sign in to a streaming app on a TV:
//   1. The new device chooses "Show a code". It makes a one-time key pair (ECDH P-256) and an 8-digit
//      code, and leaves its public key with the sync service under a hash of the code.
//   2. On a device that already syncs (or will), you choose "Enter a code" and type the 8 digits. That
//      device fetches the public key, encrypts its sync code to it (ECDH + HKDF + AES-GCM, with the
//      8-digit code mixed in), and leaves the locked result with the service.
//   3. The new device picks it up, unlocks it with its private key, and joins the sync.
// A code works once and expires after ten minutes. The service only ever holds public keys and locked
// data. Limit: this trusts the service to pass the public keys along unchanged; the QR code method
// (which never involves the service) does not have that limit.
import { syncUrl } from './sync-config.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
export const PAIR_CODE_DIGITS = 8;
const POLL_MS = 2000;

const toB64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** A new 8-digit code, each digit equally likely. */
export function newPairCode() {
  const out = [];
  while (out.length < PAIR_CODE_DIGITS) {
    for (const x of crypto.getRandomValues(new Uint8Array(16))) if (x < 250 && out.length < PAIR_CODE_DIGITS) out.push(x % 10);
  }
  return out.join('');
}

/** The 8 digits from whatever was typed (spaces and dashes are fine), or '' if it is not 8 digits. */
export function cleanPairCode(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.length === PAIR_CODE_DIGITS ? digits : '';
}

export const groupedPairCode = (code) => `${code.slice(0, 4)} ${code.slice(4)}`;

/** Where the service keeps this code's pairing: a hash, so the code itself is never stored. */
export async function pairId(code) {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`atlas-pair-v1|${code}`)));
}

async function sharedKey(privateKey, theirPubB64, code) {
  const theirPub = await crypto.subtle.importKey('raw', fromB64(theirPubB64), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirPub }, privateKey, 256);
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('atlas-pair-v1'), info: enc.encode(`code:${code}`) },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Step 1, on the new device: a code, its one-time key pair and the public key to share. */
export async function makeOffer(code = newPairCode()) {
  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = toB64(await crypto.subtle.exportKey('raw', keyPair.publicKey));
  return { code, id: await pairId(code), keyPair, pub };
}

/** Step 2, on the device that types the code: locks the sync code so only the new device can open it. */
export async function sealForOffer(secret, offerPub, code, id) {
  const mine = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const key = await sharedKey(mine.privateKey, offerPub, code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(id) }, key, enc.encode(secret));
  return JSON.stringify({ v: 1, pub: toB64(await crypto.subtle.exportKey('raw', mine.publicKey)), iv: toB64(iv), ct: toB64(ct) });
}

/** Step 3, back on the new device: unlocks the sync code. Throws if it was not made for this offer. */
export async function openForOffer(sealed, offer) {
  const env = JSON.parse(sealed);
  if (!env || env.v !== 1) throw new Error('Unknown pairing format.');
  const key = await sharedKey(offer.keyPair.privateKey, env.pub, offer.code);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv), additionalData: enc.encode(offer.id) }, key, fromB64(env.ct));
  return dec.decode(plain);
}

// ─── Talking to the service ──────────────────────────────────────────────────

class PairError extends Error {}

async function call(method, id, { body, answer = false } = {}) {
  let res;
  try {
    res = await fetch(`${syncUrl()}/v1/pairings/${id}${answer ? '/answer' : ''}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new PairError('Could not reach the sync service. Check your connection and try again.');
  }
  return res;
}

/**
 * "Show a code": registers a new code and waits for the other device. Returns
 * { code, expiresAt, done, cancel }, where `done` resolves to the sync code once the other device
 * answers, or rejects (expired, cancelled or failed) with a message to show.
 */
export async function showCode() {
  let offer = null;
  let expiresAt = 0;
  for (let attempt = 0; attempt < 3 && !offer; attempt++) {
    const candidate = await makeOffer();
    const res = await call('PUT', candidate.id, { body: { pub: candidate.pub } });
    if (res.status === 409) continue; // that code happens to be in use: pick another
    if (!res.ok) throw new PairError(`The sync service could not make a code (${res.status}). Try again in a moment.`);
    expiresAt = (await res.json()).expiresAt;
    offer = candidate;
  }
  if (!offer) throw new PairError('Could not make a code. Try again in a moment.');

  let cancelled = false;
  let timer = null;
  let rejectDone = () => {};
  const done = new Promise((resolve, reject) => {
    rejectDone = reject;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() > expiresAt) { reject(new PairError('The code expired. Get a new code to try again.')); return; }
      try {
        const res = await call('GET', offer.id);
        const body = res.ok ? await res.json() : null;
        if (cancelled) return;
        if (body?.found === false) { reject(new PairError('The code expired. Get a new code to try again.')); return; }
        if (body?.sealed) {
          let secret;
          try { secret = await openForOffer(body.sealed, offer); } catch { reject(new PairError('The answer could not be unlocked. Get a new code and try again.')); return; }
          call('DELETE', offer.id).catch(() => {});
          resolve(secret);
          return;
        }
      } catch { /* a dropped connection: keep waiting until the code expires */ }
      timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
  });
  const cancel = () => {
    cancelled = true;
    clearTimeout(timer);
    call('DELETE', offer.id).catch(() => {});
    rejectDone(new PairError('Cancelled.'));
  };
  done.catch(() => {}); // the caller handles it; this stops an "unhandled" warning after cancel
  return { code: offer.code, expiresAt, done, cancel };
}

/** "Enter a code": sends `secret` to the device showing `code`. Returns '' or a problem to show. */
export async function answerCode(code, secret) {
  const id = await pairId(code);
  try {
    const res = await call('GET', id);
    const body = res.ok ? await res.json() : null;
    if (!body?.found) return 'That code was not found. Check the 8 digits, or get a new code on the other device (codes last 10 minutes).';
    if (body.sealed) return 'That code was already used. Get a new code on the other device.';
    const sealed = await sealForOffer(secret, body.pub, code, id);
    const ans = await call('POST', id, { answer: true, body: { sealed } });
    if (ans.status === 409) return 'That code was already used. Get a new code on the other device.';
    if (ans.status === 404) return 'That code just expired. Get a new code on the other device.';
    if (!ans.ok) return `The sync service had a problem (${ans.status}). Try again in a moment.`;
    return '';
  } catch (err) {
    return err instanceof PairError ? err.message : 'Something went wrong. Try again in a moment.';
  }
}
