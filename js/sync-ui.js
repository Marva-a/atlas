// Settings → Data → "Sync across your devices": turning sync on, connecting another device by QR code,
// link or typed code, the current status, and turning it off.
import * as sync from './sync.js';
import { groupedSecret, cleanSecret } from './sync-crypto.js';
import qrcode from './vendor/qrcode.mjs';
import { esc, announce } from './ui.js';

const ui = {
  pendingPair: null, // a code from a pairing link, waiting for you to confirm
  joinOpen: false,
  joinProblem: '',
  showPair: false,
  confirmDelete: false,
  message: '',
  problem: '',
};

let refreshAll = () => {};
/** How the rest of the page is redrawn after an action finishes (set by main.js). */
export function setSyncRefresh(fn) { refreshAll = fn; }

/** Redraws just this card, so a status change never disturbs what you are doing elsewhere. */
export function refreshSyncPanel() {
  const panel = document.getElementById('sync-panel');
  if (!panel) return;
  const focusedId = panel.contains(document.activeElement) ? document.activeElement.id : null;
  panel.outerHTML = syncPanelHtml();
  if (focusedId) document.getElementById(focusedId)?.focus();
}

/**
 * A pairing link (#pair/CODE) was opened. Nothing happens until you confirm on the Settings page,
 * because a link from someone else would otherwise connect your data to their sync.
 */
export function receivePairingLink(code) {
  const secret = cleanSecret(`#pair/${code}`);
  ui.pendingPair = secret || 'invalid';
  ui.message = '';
  ui.problem = '';
}

const when = (iso) => new Date(iso).toLocaleString('en-CA', { timeZone: 'America/Vancouver', dateStyle: 'medium', timeStyle: 'short' });

/** The QR code as SVG. Always dark on light, in both themes, so every camera can read it. */
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + pad} ${r + pad}h1v1h-1z`;
  const size = n + pad * 2;
  return `<svg class="sync-qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code that connects another device to your sync" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

function statusHtml(s) {
  if (s.state === 'syncing') return '<span aria-live="polite">Syncing…</span>';
  if (s.state === 'error') return `<strong>Needs attention.</strong> ${esc(s.message)}`;
  if (s.state === 'waiting') return `Waiting. ${esc(s.message)}`;
  return s.lastSyncAt ? `Up to date. Last synced ${esc(when(s.lastSyncAt).replace(/\.$/, ''))}.` : 'Ready. The first sync starts in a moment.';
}

function pendingPairHtml() {
  if (ui.pendingPair === 'invalid') {
    return `<div class="note note--gate" role="alert">
      <p><strong>That pairing link is incomplete.</strong> Scan the QR code again, or type the code instead.</p>
      <div class="button-row"><button type="button" data-action="sync-pair-cancel">Close</button></div>
    </div>`;
  }
  if (sync.isOn() && sync.getSecret() === ui.pendingPair) {
    return `<div class="note note--gate"><p class="status-ok">This device is already connected with that code.</p>
      <div class="button-row"><button type="button" data-action="sync-pair-cancel">Close</button></div></div>`;
  }
  if (sync.isOn()) {
    return `<div class="note note--gate" role="alert">
      <p><strong>This device already syncs with a different code.</strong> To switch, turn sync off below, then open the link again.</p>
      <div class="button-row"><button type="button" data-action="sync-pair-cancel">Keep the current sync</button></div>
    </div>`;
  }
  return `<div class="note note--gate" id="sync-pair-confirm" tabindex="-1" role="region" aria-label="Connect this device">
    <p><strong>Connect this device to your synced Atlas?</strong></p>
    <p>Only continue if you opened this link from <strong>your own</strong> device. Anyone with the link can read and change the synced progress, and connecting would share this device's progress with them.</p>
    <p>Your progress here is combined with the synced copy. Nothing is deleted.</p>
    <div class="button-row">
      <button type="button" class="button--primary" data-action="sync-pair-confirm">Connect this device</button>
      <button type="button" data-action="sync-pair-cancel">Cancel</button>
    </div>
  </div>`;
}

function offHtml() {
  return `
    <p>Keep your progress the same on your phone and your computer. Lessons you complete, your answers, notes, flashcards and Security+ progress appear on every device you connect.</p>
    <p class="meta">No account is needed. Your data is encrypted on this device before it is uploaded, so the sync service cannot read it. Course content, your theme and anything made with the test date on stay on each device.</p>
    <div class="button-row">
      <button type="button" class="button--primary" data-action="sync-on">Turn on sync</button>
      <button type="button" data-action="sync-join-toggle" aria-expanded="${ui.joinOpen}" aria-controls="sync-join-form">I already use sync on another device</button>
    </div>
    ${ui.joinOpen ? `
      <form id="sync-join-form" novalidate>
        <p>On the device that already syncs, open <strong>Settings → Data → Connect another device</strong>. Scan its QR code with this device's camera, or type the code here.</p>
        <div class="field">
          <label for="sync-code">Sync code or link</label>
          <input type="text" id="sync-code" name="code" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="sync-code-hint${ui.joinProblem ? ' sync-code-error' : ''}" ${ui.joinProblem ? 'aria-invalid="true"' : ''}>
          <span class="hint" id="sync-code-hint">43 characters. Spaces do not matter.</span>
          ${ui.joinProblem ? `<span class="field-error" id="sync-code-error">${esc(ui.joinProblem)}</span>` : ''}
        </div>
        <div class="button-row"><button type="submit" class="button--primary">Connect</button></div>
      </form>` : ''}`;
}

function pairHtml() {
  const link = sync.pairingLink();
  return `
    <div class="sync-pair" id="sync-pair" tabindex="-1" role="region" aria-labelledby="sync-pair-heading">
      <h3 id="sync-pair-heading">Connect another device</h3>
      <div class="sync-pair__body">
        ${qrSvg(link)}
        <div>
          <ol class="sync-steps">
            <li>Point the other device's camera at this QR code.</li>
            <li>Open the link it shows. Atlas opens and asks to connect.</li>
            <li>Choose <strong>Connect this device</strong>.</li>
          </ol>
          <p class="meta">No camera handy? Send yourself the link, or type the code in <strong>I already use sync on another device</strong>.</p>
          <p class="meta"><strong>Atlas on your iPhone home screen?</strong> A scanned link opens in Safari, which keeps its own separate data. Open Atlas from the home screen instead and type the code there.</p>
        </div>
      </div>
      <div class="field">
        <label for="sync-link">Pairing link</label>
        <input type="text" id="sync-link" value="${esc(link)}" readonly>
      </div>
      <div class="button-row">
        <button type="button" class="button--small" data-action="sync-copy-link">Copy link</button>
      </div>
      <details>
        <summary>Show the code to type instead</summary>
        <p class="sync-code" translate="no">${esc(groupedSecret(sync.getSecret()))}</p>
      </details>
      <p class="note"><strong>Treat this like a password.</strong> Anyone with this QR code, link or code can read and change your synced progress. Share it only with your own devices.</p>
    </div>`;
}

function onHtml() {
  const s = sync.getStatus();
  return `
    <dl class="facts">
      <div><dt>Status</dt><dd id="sync-status">${statusHtml(s)}</dd></div>
      <div><dt>Encryption</dt><dd>On. The sync service stores only a locked copy it cannot read.</dd></div>
    </dl>
    <div class="button-row">
      <button type="button" data-action="sync-now" ${s.state === 'syncing' ? 'disabled' : ''}>Sync now</button>
      <button type="button" data-action="sync-pair-toggle" aria-expanded="${ui.showPair}" aria-controls="sync-pair">${ui.showPair ? 'Hide the QR code' : 'Connect another device'}</button>
    </div>
    ${ui.showPair ? pairHtml() : ''}
    <details ${ui.confirmDelete ? 'open' : ''}>
      <summary>Turn off sync</summary>
      <p><strong>Turn off on this device</strong> stops syncing here. Your data on this device and on your other devices stays as it is.</p>
      <div class="button-row"><button type="button" data-action="sync-off">Turn off on this device</button></div>
      <p><strong>Delete the cloud copy</strong> removes the encrypted copy from the sync service and turns sync off here. Data on each device is kept, but your other devices stop syncing.</p>
      ${ui.confirmDelete ? `
        <div class="note note--gate" role="alert" id="sync-delete-confirm" tabindex="-1">
          <p>Delete the cloud copy? This cannot be undone.</p>
          <div class="button-row">
            <button type="button" class="button--danger" data-action="sync-delete-confirm">Delete the cloud copy</button>
            <button type="button" data-action="sync-delete-cancel">Cancel</button>
          </div>
        </div>` : '<div class="button-row"><button type="button" class="button--danger" data-action="sync-delete">Delete the cloud copy…</button></div>'}
    </details>`;
}

export function syncPanelHtml() {
  const body = !sync.isAvailable()
    ? `<p>Sync is not set up for this copy of Atlas yet, so your data stays in this browser. To move it to another device, download a backup file below and restore it there.</p>`
    : `${ui.pendingPair ? pendingPairHtml() : ''}${sync.isOn() ? onHtml() : offHtml()}`;
  return `
    <section class="card" id="sync-panel" aria-labelledby="sync-heading">
      <h2 id="sync-heading" tabindex="-1">Sync across your devices</h2>
      ${ui.message ? `<p class="status-ok" id="sync-message" tabindex="-1">${esc(ui.message)}</p>` : ''}
      ${ui.problem ? `<div class="error-summary" role="alert" id="sync-problem" tabindex="-1"><p>${esc(ui.problem)}</p></div>` : ''}
      ${body}
    </section>`;
}

/** After an async step: report how it went, redraw, and move focus to the result. */
function finish(okMessage) {
  const s = sync.getStatus();
  if (s.state === 'error') { ui.problem = s.message; ui.message = ''; } else { ui.message = okMessage; ui.problem = ''; }
  announce(ui.problem || ui.message);
  refreshAll(ui.problem ? '#sync-problem' : '#sync-message');
}

export const syncActions = {
  'sync-on': () => {
    ui.message = ''; ui.problem = ''; ui.joinOpen = false;
    sync.turnOn().then(() => { ui.showPair = true; finish('Sync is on. To add your phone, scan the QR code below with it.'); });
    return '#sync-heading';
  },
  'sync-join-toggle': () => {
    ui.joinOpen = !ui.joinOpen;
    ui.joinProblem = '';
    return ui.joinOpen ? '#sync-code' : '[data-action="sync-join-toggle"]';
  },
  'sync-pair-confirm': () => {
    const code = ui.pendingPair;
    ui.pendingPair = null;
    ui.message = ''; ui.problem = '';
    sync.join(code).then(() => finish('This device is connected. Your progress from your other devices is here now.'));
    return '#sync-heading';
  },
  'sync-pair-cancel': () => {
    ui.pendingPair = null;
    announce('Not connected. Nothing was changed.');
    return '#sync-heading';
  },
  'sync-now': () => {
    ui.message = ''; ui.problem = '';
    sync.syncNow().then(() => finish('Synced.'));
    return '#sync-heading';
  },
  'sync-pair-toggle': () => {
    ui.showPair = !ui.showPair;
    return ui.showPair ? '#sync-pair' : '[data-action="sync-pair-toggle"]';
  },
  'sync-copy-link': () => {
    const link = sync.pairingLink();
    const done = () => { ui.message = 'Link copied. Open it on your other device.'; ui.problem = ''; announce(ui.message); refreshAll('#sync-message'); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(link).then(done, () => { document.getElementById('sync-link')?.select(); });
    else document.getElementById('sync-link')?.select();
    return null;
  },
  'sync-off': () => {
    sync.turnOff();
    ui.showPair = false; ui.confirmDelete = false; ui.problem = '';
    ui.message = 'Sync is off on this device. Your data here is unchanged.';
    announce(ui.message);
    return '#sync-message';
  },
  'sync-delete': () => { ui.confirmDelete = true; return '#sync-delete-confirm'; },
  'sync-delete-cancel': () => { ui.confirmDelete = false; return '[data-action="sync-delete"]'; },
  'sync-delete-confirm': () => {
    sync.deleteCloudCopy().then((problem) => {
      ui.confirmDelete = false;
      if (problem) { ui.problem = problem; ui.message = ''; } else { ui.showPair = false; ui.problem = ''; ui.message = 'The cloud copy is deleted and sync is off. Your data on this device is unchanged.'; }
      announce(ui.problem || ui.message);
      refreshAll(ui.problem ? '#sync-problem' : '#sync-message');
    });
    return '#sync-heading';
  },
};

/** The "connect with a code" form. Returns the element to focus. */
export function submitSyncJoin(form) {
  const code = form.elements.code.value;
  if (!cleanSecret(code)) {
    ui.joinProblem = 'That code is not complete. It has 43 letters, numbers, dashes or underscores; spaces do not matter.';
    return '#sync-code';
  }
  ui.joinProblem = '';
  ui.joinOpen = false;
  ui.message = ''; ui.problem = '';
  sync.join(code).then(() => finish('This device is connected. Your progress from your other devices is here now.'));
  return '#sync-heading';
}
