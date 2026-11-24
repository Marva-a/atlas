// Sync between your devices. Optional and off until you turn it on in Settings → Data.
//
// One round: download your encrypted copy, unlock it, merge it with this device's data (sync-state.js),
// save the result here, and upload the merged copy if it has anything new. Rounds run when Atlas opens,
// when you come back to it, when the connection returns, every 45 seconds while it is open, and shortly
// after you change something (no more than one upload every 15 seconds, to stay inside free limits).
//
// Your sync code lives only in this browser's storage. It is never sent to the service: only the vault
// id and access key worked out from it are (see sync-crypto.js).
import * as store from './store.js';
import { SCHEMA_VERSION } from './records.js';
import { mergeStates, sameState, stateProblems } from './sync-state.js';
import { newSecret, cleanSecret, deriveKeys, sealState, openState } from './sync-crypto.js';
import { syncUrl } from './sync-config.js';

export const CONFIG_KEY = 'identity-lab-coach:sync';
const PUSH_GAP_MS = 15000; // at least this long between uploads
const CHANGE_DELAY_MS = 4000; // wait this long after a change, in case more follow
const PULL_EVERY_MS = 45000; // check for changes from other devices this often while open
const MAX_CONFLICT_RETRIES = 3;

let config = readConfig(); // { secret, since, lastSyncAt } or null
let keys = null;
let status = { state: config ? 'idle' : 'off', message: '', lastSyncAt: config?.lastSyncAt ?? null };
let running = null; // the round in progress (a promise)
let again = false; // a change arrived during a round: run another one after it
let changeTimer = null;
let lastPushAt = 0;
let applying = false; // saves made by sync itself are not "changes" to upload
const statusListeners = new Set();
const dataListeners = new Set();

function readConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    return c && typeof c.secret === 'string' && cleanSecret(c.secret) ? c : null;
  } catch {
    return null;
  }
}
function writeConfig() {
  try {
    if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    else localStorage.removeItem(CONFIG_KEY);
  } catch { /* storage blocked: sync works for this visit only */ }
}

function setStatus(next) {
  status = { ...status, ...next };
  for (const fn of statusListeners) { try { fn(status); } catch { /* never break sync over a listener */ } }
}

/** Is there a sync service for this copy of Atlas? */
export const isAvailable = () => Boolean(syncUrl());
export const isOn = () => Boolean(config);
export const getStatus = () => status;
export const getSecret = () => config?.secret ?? null;
/** Called with the new status whenever it changes. */
export const onStatusChange = (fn) => statusListeners.add(fn);
/** Called after sync brought in changes from another device, so the page can redraw. */
export const onDataChanged = (fn) => dataListeners.add(fn);

/** The link another device opens (or scans as a QR code) to join. The code is in the part after #, which browsers never send to a server. */
export function pairingLink() {
  if (!config) return '';
  const base = `${location.origin}${location.pathname}`;
  return `${base}#pair/${config.secret}`;
}

const endpoint = () => `${syncUrl()}/v1/vaults/${keys.vaultId}`;
const authHeaders = () => ({ Authorization: `Bearer ${keys.authToken}` });

class SyncError extends Error {
  constructor(message, { offline = false } = {}) { super(message); this.offline = offline; }
}

async function call(method, body, extraHeaders = {}) {
  let res;
  try {
    res = await fetch(endpoint(), {
      method,
      headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}), ...extraHeaders },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new SyncError(offline ? 'You are offline. Changes are kept here and sync when you are back online.' : 'Could not reach the sync service. Atlas will try again shortly.', { offline: true });
  }
  return res;
}

async function download() {
  const res = await call('GET');
  if (res.status === 404) return { state: null, rev: 0 };
  if (res.status === 401 || res.status === 403) throw new SyncError('The sync service did not accept this sync code. If you deleted the cloud copy from another device, turn sync off here and on again.');
  if (res.status === 429) throw new SyncError('The sync service is busy (its free daily limit may be used up). Your changes are safe here and will sync later.', { offline: true });
  if (!res.ok) throw new SyncError(`The sync service had a problem (${res.status}). Atlas will try again shortly.`, { offline: true });
  const body = await res.json();
  if (body.blob == null) return { state: null, rev: Number(body.rev) || 0 };
  let state;
  try {
    state = await openState(body.blob, keys);
  } catch {
    throw new SyncError('The synced copy could not be unlocked with this sync code. Check that every device uses the same code.');
  }
  const problems = stateProblems(state);
  if (problems.length) throw new SyncError(problems[0]);
  if ((state.schemaVersion ?? 0) > SCHEMA_VERSION) throw new SyncError('Another device is on a newer version of Atlas. Reload Atlas here to update it, then sync again.');
  return { state, rev: Number(body.rev) || 0 };
}

async function upload(state, rev) {
  const blob = await sealState(state, keys);
  const res = await call('PUT', { blob }, { 'If-Match': String(rev) });
  if (res.status === 409) return { conflict: true };
  if (res.status === 413) throw new SyncError('Your data is too large for the sync service. Export a backup file and contact the Atlas maintainer.');
  if (res.status === 401 || res.status === 403) throw new SyncError('The sync service did not accept this sync code.');
  if (res.status === 429) throw new SyncError('The sync service is busy (its free daily limit may be used up). Your changes are safe here and will sync later.', { offline: true });
  if (!res.ok) throw new SyncError(`The sync service had a problem (${res.status}). Atlas will try again shortly.`, { offline: true });
  lastPushAt = Date.now();
  return { conflict: false };
}

/** One full round. Resolves to true if this device's data changed. */
async function round() {
  keys ??= await deriveKeys(config.secret);
  let changedHere = false;
  for (let attempt = 0; attempt <= MAX_CONFLICT_RETRIES; attempt++) {
    const remote = await download();
    if (!config) return changedHere; // turned off while waiting
    const local = store.getSyncState();
    if (!local) throw new SyncError('Your data here could not be read, so nothing was synced.');
    let merged = remote.state ? mergeStates(local, remote.state) : local;
    if (!sameState(merged, local)) {
      applying = true;
      try { store.applySyncState(merged); } finally { applying = false; }
      changedHere = true;
      // Saving fills in any fields an older record lacked. Upload that settled version, so the next
      // round finds nothing new instead of trading the same items back and forth.
      merged = store.getSyncState() ?? merged;
    }
    if (remote.state && sameState(merged, remote.state)) return changedHere;
    const result = await upload(merged, remote.rev);
    if (!result.conflict) return changedHere;
    // Another device uploaded in between: download its copy and merge again.
  }
  throw new SyncError('Other devices kept changing the synced copy. Atlas will try again shortly.', { offline: true });
}

/** Runs a sync round now (or right after the one in progress). Never throws; read the status instead. */
export function syncNow() {
  if (!config || !isAvailable()) return Promise.resolve(false);
  if (running) { again = true; return running; }
  clearTimeout(changeTimer);
  changeTimer = null;
  setStatus({ state: 'syncing', message: '' });
  running = round()
    .then((changed) => {
      config.lastSyncAt = new Date().toISOString();
      writeConfig();
      setStatus({ state: 'idle', message: '', lastSyncAt: config.lastSyncAt });
      if (changed) for (const fn of dataListeners) { try { fn(); } catch { /* keep going */ } }
      return changed;
    })
    .catch((err) => {
      if (config) setStatus({ state: err?.offline ? 'waiting' : 'error', message: err?.message || 'Sync failed. Atlas will try again shortly.' });
      return false;
    })
    .finally(() => {
      running = null;
      if (again && config) { again = false; noteChanged(); }
    });
  return running;
}

/** Called after every save: schedules an upload soon, but no sooner than 15 seconds after the last one. */
export function noteChanged() {
  if (!config || applying || !isAvailable()) return;
  if (running) { again = true; return; }
  if (changeTimer) return;
  const wait = Math.max(CHANGE_DELAY_MS, lastPushAt + PUSH_GAP_MS - Date.now());
  changeTimer = setTimeout(() => { changeTimer = null; syncNow(); }, wait);
}

/** Turns sync on with a new code, and uploads this device's data. */
export async function turnOn() {
  config = { secret: newSecret(), since: new Date().toISOString(), lastSyncAt: null };
  keys = null;
  writeConfig();
  setStatus({ state: 'idle', message: '', lastSyncAt: null });
  return syncNow();
}

/** Joins the sync of another device. Returns '' or a problem to show. */
export async function join(input) {
  const secret = cleanSecret(input);
  if (!secret) return 'That code is not complete. It has 43 letters, numbers, dashes or underscores; spaces do not matter.';
  config = { secret, since: new Date().toISOString(), lastSyncAt: null };
  keys = null;
  writeConfig();
  setStatus({ state: 'idle', message: '', lastSyncAt: null });
  await syncNow();
  return '';
}

/** Stops syncing on this device. Your data here, and the cloud copy, are left as they are. */
export function turnOff() {
  clearTimeout(changeTimer);
  changeTimer = null;
  config = null;
  keys = null;
  writeConfig();
  setStatus({ state: 'off', message: '', lastSyncAt: null });
}

/** Deletes the cloud copy, then stops syncing here. Other devices will report that the code no longer works. */
export async function deleteCloudCopy() {
  if (!config) return '';
  try {
    keys ??= await deriveKeys(config.secret);
    const res = await call('DELETE');
    if (!res.ok && res.status !== 404) return `The sync service could not delete it (${res.status}). Try again later.`;
  } catch (err) {
    return err?.message || 'Could not reach the sync service. Try again when you are online.';
  }
  turnOff();
  return '';
}

/** Starts the background rounds. Call once, after the data has loaded. */
export function start() {
  store.onSave(noteChanged);
  if (!isAvailable()) return;
  let lastFocusSync = 0;
  const soon = () => {
    if (!config || document.hidden) return;
    if (Date.now() - lastFocusSync < 10000) return; // coming and going quickly: one round is enough
    lastFocusSync = Date.now();
    syncNow();
  };
  document.addEventListener('visibilitychange', soon);
  window.addEventListener('online', soon);
  window.addEventListener('focus', soon);
  setInterval(() => { if (config && !document.hidden) syncNow(); }, PULL_EVERY_MS);
  if (config) { lastFocusSync = Date.now(); syncNow(); }
}
