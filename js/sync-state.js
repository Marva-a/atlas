// Sync state: what is shared between your devices, and how two copies are merged.
//
// Pure functions only (no storage, no network), so the rules can be checked with `node js/sync-selftest.js`.
//
// What syncs: your own progress and records (sessions, flashcards and ratings, lessons done, answers,
// notes, the library's ticks and notes, portfolio pieces, people, Security+ progress, a few settings).
// What does not: course content (each device adds its own packs), anything made while the test date is
// on, the theme, the timer and an exam you are sitting right now.
//
// Every shared item has a path (for example "sessions" or "cert.lessons") and a key (its id). The merge
// keeps, for each key, the most recent change on either device. A deletion is remembered as a
// "tombstone" with its time, so a device that still has the item does not bring it back.

export const SYNC_FORMAT = 'atlas-sync';
export const SYNC_FORMAT_VERSION = 1;
/** Tombstones older than this are forgotten; a device offline for longer may bring a deleted item back. */
export const TOMBSTONE_DAYS = 400;

const ARRAYS = ['sessions', 'cards', 'cardReviews', 'tallies', 'artifacts', 'people', 'interactions', 'resources', 'reviews', 'lessonNotes'];
const MAPS = ['lessonAnswers', 'lessonsDone', 'optionalOverrides', 'weekChecks'];
const CERT_MAPS = ['lessons', 'labs', 'q', 'pbq', 'extraWeeks', 'design'];
const CERT_LOGS = {
  reviews: (r) => (r && r.obj != null && r.at != null ? `${r.obj}|${r.at}` : null),
  exams: (e) => (e && e.id != null && e.at != null ? `${e.id}|${e.at}` : null),
};
/** Settings that follow you between devices. The theme and test date stay with each device. */
export const SYNCED_SETTINGS = ['swapWeeks2and5', 'courseStart', 'activePathway', 'hideVisuals', 'pathwayStarted', 'pathwayFinished'];

export const SYNC_PATHS = [
  ...ARRAYS, ...MAPS, ...CERT_MAPS.map((m) => `cert.${m}`), ...Object.keys(CERT_LOGS).map((m) => `cert.${m}`), 'settings',
];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** JSON with keys in a fixed order, so equal values always give equal text on every device. */
export function stableStringify(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** A map entry made while the test date was on. Its real value, if any, waits in testPrev. */
const isTestEntry = (v) => isObj(v) && v.testMode === true;

/**
 * The shared part of an app document: { path: { key: value } }. Test-mode records are left out;
 * a test-mode map entry contributes the real value it replaced (testPrev), if there was one.
 */
export function syncView(doc) {
  const out = {};
  for (const name of ARRAYS) {
    const m = {};
    for (const r of Array.isArray(doc?.[name]) ? doc[name] : []) {
      if (isObj(r) && typeof r.id === 'string' && r.id && r.testMode !== true) m[r.id] = r;
    }
    out[name] = m;
  }
  for (const name of MAPS) {
    const m = {};
    const src = isObj(doc?.[name]) ? doc[name] : {};
    for (const [k, v] of Object.entries(src)) {
      if (isTestEntry(v)) { if (v.testPrev) m[k] = v.testPrev; } else if (v !== undefined) m[k] = v;
    }
    out[name] = m;
  }
  const cert = isObj(doc?.cert) ? doc.cert : {};
  for (const name of CERT_MAPS) {
    const m = {};
    for (const [k, v] of Object.entries(isObj(cert[name]) ? cert[name] : {})) if (v !== undefined) m[k] = v;
    out[`cert.${name}`] = m;
  }
  for (const [name, keyOf] of Object.entries(CERT_LOGS)) {
    const m = {};
    for (const r of Array.isArray(cert[name]) ? cert[name] : []) {
      const k = keyOf(r);
      if (k) m[k] = r;
    }
    out[`cert.${name}`] = m;
  }
  const s = {};
  for (const f of SYNCED_SETTINGS) if (doc?.settings && doc.settings[f] !== undefined) s[f] = doc.settings[f];
  out.settings = s;
  return out;
}

/** Empty change record: t = when each item last changed, del = when each item was deleted. */
export function emptyMeta() {
  return { t: {}, del: {} };
}

/**
 * The shared part of a document as text: { path: { key: JSON } }. Views share objects with the live
 * document, which the app changes in place, so changes are found by comparing these texts instead.
 */
export function viewSnapshot(doc) {
  const view = syncView(doc);
  const out = {};
  for (const path of SYNC_PATHS) {
    out[path] = {};
    for (const [k, v] of Object.entries(view[path])) out[path][k] = stableStringify(v);
  }
  return out;
}

/**
 * Records what changed between two snapshots (from viewSnapshot), at time `now` (ms). Mutates and
 * returns `meta`. New or changed items get a change time; items that disappeared get a tombstone.
 */
export function stampChanges(prev, next, meta, now) {
  meta.t ??= {};
  meta.del ??= {};
  for (const path of SYNC_PATHS) {
    const a = prev?.[path] ?? {};
    const b = next?.[path] ?? {};
    for (const k of Object.keys(b)) {
      if (!own(a, k) || a[k] !== b[k]) {
        (meta.t[path] ??= {})[k] = now;
        if (meta.del[path]) delete meta.del[path][k];
      }
    }
    for (const k of Object.keys(a)) {
      if (!own(b, k)) {
        (meta.del[path] ??= {})[k] = now;
        if (meta.t[path]) delete meta.t[path][k];
      }
    }
  }
  return meta;
}

/** The shareable state of a document: what is uploaded (encrypted) and merged. */
export function toState(doc, meta, schemaVersion) {
  const entries = syncView(doc);
  const t = {};
  const del = {};
  for (const path of SYNC_PATHS) {
    t[path] = {};
    for (const k of Object.keys(entries[path])) if (meta?.t?.[path]?.[k] != null) t[path][k] = meta.t[path][k];
    del[path] = {};
    for (const [k, at] of Object.entries(meta?.del?.[path] ?? {})) if (!own(entries[path], k)) del[path][k] = at;
  }
  return { format: SYNC_FORMAT, v: SYNC_FORMAT_VERSION, schemaVersion, entries, t, del };
}

/** Is this a well-formed state from another device? Returns a list of problems (empty = fine). */
export function stateProblems(state) {
  if (!isObj(state) || state.format !== SYNC_FORMAT) return ['This is not Atlas sync data.'];
  if (state.v !== SYNC_FORMAT_VERSION) return [`The synced copy uses format ${String(state.v).slice(0, 8)}, which this version of Atlas does not know. Reload Atlas on every device to update it.`];
  for (const part of ['entries', 't', 'del']) if (!isObj(state[part])) return [`The synced copy is missing "${part}".`];
  for (const path of Object.keys(state.entries)) if (!isObj(state.entries[path])) return [`The synced copy has a broken "${path}".`];
  return [];
}

/**
 * When an item last changed, for items that have no recorded change time (data from before sync was
 * switched on). Uses the item's own updatedAt, at or createdAt, or a timestamp value itself. 0 = unknown.
 */
export function fallbackTime(v) {
  if (typeof v === 'number' && v > 1e11) return v;
  if (!isObj(v)) return 0;
  for (const f of ['updatedAt', 'at', 'createdAt']) {
    const x = v[f];
    if (typeof x === 'number' && x > 1e11) return x;
    if (typeof x === 'string') {
      const ms = Date.parse(x);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return 0;
}

/** True for values that carry no information: a device's untouched default should not beat a real value. */
function isEmptyValue(v) {
  if (v === null || v === undefined || v === '' || v === false || v === 0) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (isObj(v)) return Object.keys(v).length === 0;
  return false;
}

/** Picks between two versions of the same item. Same answer on every device, whichever is "local". */
function pick(x, y) {
  if (x.time !== y.time) return x.time > y.time ? x : y;
  const ex = isEmptyValue(x.value);
  const ey = isEmptyValue(y.value);
  if (ex !== ey) return ex ? y : x;
  return x.text >= y.text ? x : y;
}

/**
 * Merges two states. The result is the same whichever order they are given in, and merging it again
 * with either input changes nothing, so devices that sync in any order end up with the same data.
 */
export function mergeStates(a, b, now = Date.now()) {
  const out = { format: SYNC_FORMAT, v: SYNC_FORMAT_VERSION, schemaVersion: Math.max(a?.schemaVersion ?? 0, b?.schemaVersion ?? 0), entries: {}, t: {}, del: {} };
  const forgetBefore = now - TOMBSTONE_DAYS * 86400000;
  const side = (s, path, k) => {
    const e = s?.entries?.[path];
    if (!e || !own(e, k)) return null;
    const value = e[k];
    const recorded = s.t?.[path]?.[k];
    return { value, time: typeof recorded === 'number' ? recorded : fallbackTime(value), text: stableStringify(value) };
  };
  for (const path of SYNC_PATHS) {
    out.entries[path] = {};
    out.t[path] = {};
    out.del[path] = {};
    const keys = new Set([
      ...Object.keys(a?.entries?.[path] ?? {}), ...Object.keys(b?.entries?.[path] ?? {}),
      ...Object.keys(a?.del?.[path] ?? {}), ...Object.keys(b?.del?.[path] ?? {}),
    ]);
    for (const k of keys) {
      const x = side(a, path, k);
      const y = side(b, path, k);
      const da = a?.del?.[path]?.[k];
      const db = b?.del?.[path]?.[k];
      const deletedAt = Math.max(typeof da === 'number' ? da : -1, typeof db === 'number' ? db : -1);
      const win = x && y ? pick(x, y) : (x ?? y);
      if (win && win.time > deletedAt) {
        out.entries[path][k] = win.value;
        if (win.time > 0) out.t[path][k] = win.time;
      } else if (deletedAt >= forgetBefore) {
        out.del[path][k] = deletedAt;
      }
    }
  }
  return out;
}

/** Puts merged entries back into a map, keeping this device's test-mode entries. */
function applyMap(local, merged) {
  const out = {};
  const src = isObj(local) ? local : {};
  for (const [k, v] of Object.entries(src)) {
    if (isTestEntry(v)) {
      const next = { ...v };
      if (own(merged, k)) next.testPrev = merged[k]; else delete next.testPrev;
      out[k] = next;
    } else if (own(merged, k)) {
      out[k] = merged[k];
    }
  }
  for (const [k, v] of Object.entries(merged)) if (!own(out, k)) out[k] = v;
  return out;
}

/** Puts merged entries back into a list, in this device's order, keeping its test-mode records. */
function applyList(local, merged, keyOf, keepLocal = () => false) {
  const out = [];
  const seen = new Set();
  for (const r of Array.isArray(local) ? local : []) {
    if (keepLocal(r)) { out.push(r); continue; }
    const k = keyOf(r);
    if (k == null) continue;
    if (own(merged, k) && !seen.has(k)) { out.push(merged[k]); seen.add(k); }
  }
  for (const [k, v] of Object.entries(merged)) if (!seen.has(k)) { out.push(v); seen.add(k); }
  return out;
}

/**
 * A copy of `doc` with the shared parts replaced by `state`. Everything else (course content, the theme,
 * the test date, an exam in progress, test-mode records) stays exactly as this device has it.
 */
export function applyState(doc, state) {
  const out = { ...doc };
  const e = state.entries;
  for (const name of ARRAYS) {
    out[name] = applyList(doc[name], e[name] ?? {}, (r) => (isObj(r) && typeof r.id === 'string' ? r.id : null), (r) => isObj(r) && r.testMode === true);
  }
  for (const name of MAPS) out[name] = applyMap(doc[name], e[name] ?? {});
  const cert = { ...(isObj(doc.cert) ? doc.cert : {}) };
  for (const name of CERT_MAPS) {
    const merged = e[`cert.${name}`] ?? {};
    cert[name] = {};
    for (const [k, v] of Object.entries(merged)) cert[name][k] = v;
  }
  for (const [name, keyOf] of Object.entries(CERT_LOGS)) cert[name] = applyList(cert[name], e[`cert.${name}`] ?? {}, keyOf);
  out.cert = cert;
  const settings = { ...(isObj(doc.settings) ? doc.settings : {}) };
  for (const f of SYNCED_SETTINGS) if (own(e.settings ?? {}, f)) settings[f] = e.settings[f];
  out.settings = settings;
  return out;
}

/** True when two states hold the same items, change times and tombstones (so nothing needs uploading). */
export function sameState(a, b) {
  return stableStringify({ e: a.entries, t: a.t, d: a.del }) === stableStringify({ e: b.entries, t: b.t, d: b.del });
}

/**
 * Gives cards from the seed set and from course packs the same id on every device ("seed-" + seedId),
 * and moves their ratings along. Each device adds these cards itself, so without this the merge would
 * see two different cards. Mutates `doc`; returns true if anything changed.
 */
export function canonicalCardIds(doc) {
  if (!Array.isArray(doc?.cards)) return false;
  const taken = new Set(doc.cards.map((c) => c?.id));
  const moved = new Map();
  for (const c of doc.cards) {
    if (!isObj(c) || typeof c.seedId !== 'string' || !c.seedId) continue;
    const id = `seed-${c.seedId}`;
    if (c.id === id || taken.has(id)) continue;
    moved.set(c.id, id);
    taken.delete(c.id);
    taken.add(id);
    c.id = id;
  }
  if (!moved.size) return false;
  for (const r of Array.isArray(doc.cardReviews) ? doc.cardReviews : []) {
    if (isObj(r) && moved.has(r.cardId)) r.cardId = moved.get(r.cardId);
  }
  return true;
}
