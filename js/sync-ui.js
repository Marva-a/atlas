// Settings → Data → "Sync across your devices". The main way to connect is a short code: "Show a code" on
// one device, "Enter a code" on the other (see sync-pair.js). A QR code, pairing link and the full sync
// code are kept under "Other ways". Also: the current status, and turning sync off.
import * as sync from './sync.js';
import { groupedSecret, cleanSecret } from './sync-crypto.js';
import { showCode, answerCode, cleanPairCode, groupedPairCode } from './sync-pair.js';
import qrcode from './vendor/qrcode.mjs';
import { esc, announce } from './ui.js';

const ui = {
  pendingPair: null, // a code from a pairing link, waiting for you to confirm
  joinOpen: false,
  joinProblem: '',
  showPair: false, // the QR code and link, under "Other ways"
  showing: null, // { code, expiresAt, cancel } while this device shows a code
  enterOpen: false, // the "Enter a code" form
  enterProblem: '',
  busy: false, // a pairing step is in progress
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

function enterFormHtml() {
  return `
    <form id="sync-enter-form" novalidate>
      <div class="field">
        <label for="sync-pair-code">Code shown on your other device</label>
        <input type="text" id="sync-pair-code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" class="sync-code-input"
          aria-describedby="sync-pair-code-hint${ui.enterProblem ? ' sync-pair-code-error' : ''}" ${ui.enterProblem ? 'aria-invalid="true"' : ''}>
        <span class="hint" id="sync-pair-code-hint">8 digits. On the other device: <strong>Settings → Data → Show a code</strong>.</span>
        ${ui.enterProblem ? `<span class="field-error" id="sync-pair-code-error">${esc(ui.enterProblem)}</span>` : ''}
      </div>
      <div class="button-row"><button type="submit" class="button--primary" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Connecting…' : 'Connect'}</button></div>
    </form>`;
}

function showingHtml() {
  const until = new Date(ui.showing.expiresAt).toLocaleTimeString('en-CA', { timeZone: 'America/Vancouver', timeStyle: 'short' });
  return `
    <div class="sync-showcode" id="sync-showcode" tabindex="-1" role="region" aria-labelledby="sync-showcode-label">
      <p class="small-label" id="sync-showcode-label">Your code</p>
      <p class="sync-bigcode" translate="no" aria-label="${esc(ui.showing.code.split('').join(' '))}">${esc(groupedPairCode(ui.showing.code))}</p>
      <p>On your other device, open Atlas, go to <strong>Settings → Data</strong>, choose <strong>Enter a code</strong> and type these 8 digits.</p>
      <p class="meta" aria-live="polite"><span class="sync-dot" aria-hidden="true"></span>Waiting for your other device. This screen updates by itself. The code works once and expires at ${esc(until.replace(/\.$/, ''))}.</p>
      <div class="button-row"><button type="button" data-action="sync-show-cancel">Cancel</button></div>
    </div>`;
}

function offHtml() {
  return `
    <p>Keep your progress the same on your phone and your computer. Lessons you complete, your answers, notes, flashcards and Security+ progress appear on every device you connect.</p>
    <ol class="sync-steps sync-steps--big">
      <li>On your <strong>phone</strong>, choose <strong>Show a code</strong>.</li>
      <li>On your <strong>computer</strong>, choose <strong>Enter a code</strong> and type it.</li>
    </ol>
    <div class="button-row">
      <button type="button" class="button--primary" data-action="sync-show-code" ${ui.busy ? 'disabled' : ''}>Show a code</button>
      <button type="button" data-action="sync-enter-toggle" aria-expanded="${ui.enterOpen}" aria-controls="sync-enter-form">Enter a code</button>
    </div>
    ${ui.enterOpen ? enterFormHtml() : ''}
    <p class="meta">No account is needed. Your data is encrypted on this device before it is uploaded, so the sync service cannot read it. Course content, your theme and anything made with the test date on stay on each device.</p>
    <details ${ui.joinOpen ? 'open' : ''}>
      <summary>Other ways to connect</summary>
      <p><strong>QR code:</strong> turn on sync here, then scan the code with your other device. The link opens in that device's default browser.</p>
      <div class="button-row"><button type="button" data-action="sync-on">Turn on sync with a QR code</button></div>
      <p><strong>Full sync code:</strong> if you already have the 43-character code or a pairing link from another device, enter it here.</p>
      <div class="button-row"><button type="button" data-action="sync-join-toggle" aria-expanded="${ui.joinOpen}" aria-controls="sync-join-form">Type a sync code</button></div>
      ${ui.joinOpen ? `
        <form id="sync-join-form" novalidate>
          <div class="field">
            <label for="sync-code">Sync code or link</label>
            <input type="text" id="sync-code" name="code" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="sync-code-hint${ui.joinProblem ? ' sync-code-error' : ''}" ${ui.joinProblem ? 'aria-invalid="true"' : ''}>
            <span class="hint" id="sync-code-hint">43 characters. Spaces do not matter.</span>
            ${ui.joinProblem ? `<span class="field-error" id="sync-code-error">${esc(ui.joinProblem)}</span>` : ''}
          </div>
          <div class="button-row"><button type="submit">Connect</button></div>
        </form>` : ''}
    </details>`;
}

function pairHtml() {
  const link = sync.pairingLink();
  return `
    <div class="sync-pair" id="sync-pair" tabindex="-1" role="region" aria-labelledby="sync-pair-heading">
      <h3 id="sync-pair-heading">QR code and link</h3>
      <div class="sync-pair__body">
        ${qrSvg(link)}
        <div>
          <ol class="sync-steps">
            <li>Point the other device's camera at this QR code.</li>
            <li>Open the link it shows. Atlas opens and asks to connect.</li>
            <li>Choose <strong>Connect this device</strong>.</li>
          </ol>
          <p class="meta"><strong>Note:</strong> a scanned link opens in the phone's <em>default</em> browser, which keeps its own separate data. If you use Atlas in another browser or from the home screen, use <strong>Show a code</strong> there instead.</p>
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
      <button type="button" class="button--primary" data-action="sync-enter-toggle" aria-expanded="${ui.enterOpen}" aria-controls="sync-add">Add another device</button>
    </div>
    ${ui.enterOpen ? `
      <div class="sync-pair" id="sync-add" tabindex="-1" role="region" aria-labelledby="sync-add-heading">
        <h3 id="sync-add-heading">Add another device</h3>
        <ol class="sync-steps">
          <li>On the other device, open Atlas and go to <strong>Settings → Data</strong>.</li>
          <li>Choose <strong>Show a code</strong>, then type the 8 digits here.</li>
        </ol>
        ${enterFormHtml()}
      </div>` : ''}
    <details ${ui.showPair ? 'open' : ''}>
      <summary>Other ways to connect (QR code, link, full code)</summary>
      ${pairHtml()}
    </details>
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
    : ui.showing ? showingHtml() : `${ui.pendingPair ? pendingPairHtml() : ''}${sync.isOn() ? onHtml() : offHtml()}`;
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
  'sync-show-code': () => {
    if (ui.busy) return null;
    ui.busy = true; ui.message = ''; ui.problem = ''; ui.enterOpen = false;
    showCode().then((showing) => {
      ui.busy = false;
      ui.showing = showing;
      refreshAll('#sync-showcode');
      return showing.done.then((secret) => {
        ui.showing = null;
        return sync.join(secret).then(() => finish('Connected. Your progress from your other device is here now, and from now on they stay in sync.'));
      });
    }).catch((err) => {
      ui.busy = false;
      ui.showing = null;
      if (err?.message === 'Cancelled.') return;
      ui.problem = err?.message || 'Something went wrong. Try again in a moment.';
      ui.message = '';
      announce(ui.problem);
      refreshAll('#sync-problem');
    });
    return '#sync-heading';
  },
  'sync-show-cancel': () => {
    ui.showing?.cancel();
    ui.showing = null;
    announce('Cancelled. The code no longer works.');
    return '[data-action="sync-show-code"], #sync-heading';
  },
  'sync-enter-toggle': () => {
    ui.enterOpen = !ui.enterOpen;
    ui.enterProblem = '';
    return ui.enterOpen ? '#sync-pair-code' : '[data-action="sync-enter-toggle"]';
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

/** The "Enter a code" form: turns sync on here if needed, then hands the sync code to the other device. */
export function submitSyncEnter(form) {
  const code = cleanPairCode(form.elements.code.value);
  if (!code) {
    ui.enterProblem = 'Type the 8 digits shown on your other device. Spaces do not matter.';
    return '#sync-pair-code';
  }
  if (ui.busy) return null;
  ui.busy = true; ui.enterProblem = ''; ui.message = ''; ui.problem = '';
  (async () => {
    if (!sync.isOn()) {
      await sync.turnOn();
      if (sync.getStatus().state === 'error') throw new Error(sync.getStatus().message);
    }
    return answerCode(code, sync.getSecret());
  })().then((problem) => {
    ui.busy = false;
    if (problem) {
      ui.enterProblem = problem;
      announce(problem);
      refreshAll('#sync-pair-code');
      return;
    }
    ui.enterOpen = false;
    ui.message = 'Done. Your other device finishes connecting in a few seconds, then both stay in sync.';
    announce(ui.message);
    refreshAll('#sync-message');
  }).catch((err) => {
    ui.busy = false;
    ui.enterProblem = err?.message || 'Something went wrong. Try again in a moment.';
    announce(ui.enterProblem);
    refreshAll('#sync-pair-code');
  });
  return null;
}
