// Checks the sync merge rules without a browser or a network. Run: node js/sync-selftest.js
import {
  syncView, viewSnapshot, stampChanges, emptyMeta, toState, mergeStates, applyState, sameState,
  canonicalCardIds, stateProblems, fallbackTime, stableStringify, SYNC_PATHS,
} from './sync-state.js';

const results = [];
const check = (name, actual, expected) => {
  const a = typeof actual === 'string' ? actual : stableStringify(actual);
  const e = typeof expected === 'string' ? expected : stableStringify(expected);
  results.push({ name, pass: a === e, actual: a, expected: e });
};

const T0 = Date.parse('2026-11-20T10:00:00Z');
const clone = (x) => JSON.parse(JSON.stringify(x));

/** A small app document, shaped like store.js's. */
function doc(over = {}) {
  return {
    schemaVersion: 5, app: 'identity-lab-coach',
    sessions: [], cards: [], cardReviews: [], tallies: [], artifacts: [], people: [], interactions: [], resources: [], reviews: [],
    lessonNotes: [], lessonAnswers: {}, lessonsDone: {}, optionalOverrides: {}, weekChecks: {},
    lessons: [{ id: 'w1-d1', title: 'Course text' }], pathways: [], pathwayLessons: [], contentPacks: { 'lessons-week-1': { version: 8 } },
    cert: { lessons: {}, labs: {}, q: {}, reviews: [], exams: [], active: null, pbq: {}, extraWeeks: {}, design: {} },
    settings: { theme: 'dark', testDate: { enabled: false, date: '' }, courseStart: null, activePathway: null, hideVisuals: false, pathwayStarted: {}, pathwayFinished: {}, swapWeeks2and5: false },
    ...over,
  };
}

/** A device: a document plus its change record, with the same bookkeeping store.js does on each save. */
function device(d) {
  const dev = { doc: d, meta: emptyMeta(), base: viewSnapshot(d) };
  dev.save = (now) => { const next = viewSnapshot(dev.doc); stampChanges(dev.base, next, dev.meta, now); dev.base = next; };
  dev.state = () => toState(dev.doc, dev.meta, 5);
  dev.apply = (state) => { dev.doc = applyState(dev.doc, state); dev.meta = { t: clone(state.t), del: clone(state.del) }; dev.base = viewSnapshot(dev.doc); };
  return dev;
}

/** One sync: pull the cloud copy, merge, apply locally, upload the merged copy. */
function sync(dev, cloud, now) {
  const merged = cloud.state ? mergeStates(dev.state(), cloud.state, now) : dev.state();
  dev.apply(merged);
  cloud.state = clone(merged);
  return merged;
}

// ─── What is shared ──────────────────────────────────────────────────────────
{
  const d = doc({
    sessions: [{ id: 's1', minutes: 30 }, { id: 's2', minutes: 10, testMode: true }],
    lessonAnswers: { a: { answers: ['real'] }, b: { answers: ['test'], testMode: true, testPrev: { answers: ['before test'] } }, c: { answers: ['t'], testMode: true } },
  });
  const v = syncView(d);
  check('View: a test-mode session is not shared', Object.keys(v.sessions), ['s1']);
  check('View: a test-mode answer shares the real answer it replaced', v.lessonAnswers.b, { answers: ['before test'] });
  check('View: a test-mode answer with nothing before it is not shared', 'c' in v.lessonAnswers, 'false');
  check('View: course content is not shared', SYNC_PATHS.includes('lessons') || SYNC_PATHS.includes('contentPacks'), 'false');
  check('View: the theme is not shared', 'theme' in v.settings, 'false');
  check('View: the course start is shared', 'courseStart' in v.settings, 'true');
}

// ─── Change times and tombstones ─────────────────────────────────────────────
{
  const dev = device(doc({ sessions: [{ id: 's1', minutes: 30 }] }));
  dev.doc.sessions.push({ id: 's2', minutes: 20 });
  dev.save(T0);
  check('Stamp: a new item gets a change time', dev.meta.t.sessions?.s2, T0);
  check('Stamp: an untouched item gets none', dev.meta.t.sessions?.s1 ?? 'none', 'none');
  dev.doc.sessions[0].minutes = 45; // changed in place, as the app does
  dev.save(T0 + 1);
  check('Stamp: an item changed in place is noticed', dev.meta.t.sessions?.s1, T0 + 1);
  dev.doc.sessions = dev.doc.sessions.filter((s) => s.id !== 's2');
  dev.save(T0 + 2);
  check('Stamp: a deleted item leaves a tombstone', dev.meta.del.sessions?.s2, T0 + 2);
  check('Stamp: and loses its change time', dev.meta.t.sessions?.s2 ?? 'none', 'none');
}

// ─── The user's case: lessons done on the browser show on the phone ──────────
{
  const cloud = {};
  const browser = device(doc());
  browser.doc.lessonsDone = { 'w1-d1': { at: '2026-11-02T18:00:00Z', done: true }, 'w1-d2': { at: '2026-11-03T18:00:00Z', done: true } };
  browser.doc.cert.lessons = { 'sp-1-1': T0 - 5000 };
  browser.doc.settings.courseStart = '2026-11-02';
  browser.save(T0);
  const phone = device(doc({ settings: { ...doc().settings, theme: 'light' } }));
  phone.doc.lessonsDone = { 'w1-d3': { at: '2026-11-04T18:00:00Z', done: true } };
  phone.save(T0 + 10);
  sync(browser, cloud, T0 + 20);
  sync(phone, cloud, T0 + 30);
  check('Join: the phone has every lesson done on either device', Object.keys(phone.doc.lessonsDone).sort(), ['w1-d1', 'w1-d2', 'w1-d3']);
  check('Join: Security+ progress arrives too', Object.keys(phone.doc.cert.lessons), ['sp-1-1']);
  check('Join: the course start arrives (a real value beats an untouched default)', phone.doc.settings.courseStart, '2026-11-02');
  check('Join: the phone keeps its own theme', phone.doc.settings.theme, 'light');
  check('Join: the phone keeps its own course content', phone.doc.lessons[0].title, 'Course text');
  sync(browser, cloud, T0 + 40);
  check('Join: the browser gets the phone\'s lesson back', Object.keys(browser.doc.lessonsDone).sort(), ['w1-d1', 'w1-d2', 'w1-d3']);
  check('Join: both devices now hold the same shared data', sameState(browser.state(), phone.state()), 'true');

  // Undo on one device, then sync both ways.
  delete phone.doc.cert.lessons['sp-1-1'];
  phone.save(T0 + 50);
  sync(phone, cloud, T0 + 60);
  sync(browser, cloud, T0 + 70);
  check('Delete: un-ticking a Security+ lesson on the phone un-ticks it on the browser', Object.keys(browser.doc.cert.lessons).length, 0);

  // The browser had not synced yet and still has it: syncing again must not bring it back.
  sync(phone, cloud, T0 + 80);
  check('Delete: a device that syncs again does not bring it back', Object.keys(phone.doc.cert.lessons).length, 0);

  // Edits to the same item on both devices while offline: the later one wins everywhere.
  browser.doc.lessonAnswers.q1 = { answers: ['browser answer'], updatedAt: '2026-11-20T10:01:00Z' };
  browser.save(T0 + 100);
  phone.doc.lessonAnswers.q1 = { answers: ['phone answer'], updatedAt: '2026-11-20T10:02:00Z' };
  phone.save(T0 + 200);
  sync(browser, cloud, T0 + 300);
  sync(phone, cloud, T0 + 310);
  sync(browser, cloud, T0 + 320);
  check('Conflict: the later edit wins on the phone', phone.doc.lessonAnswers.q1.answers[0], 'phone answer');
  check('Conflict: and on the browser', browser.doc.lessonAnswers.q1.answers[0], 'phone answer');

  // Re-adding something that was deleted (ticking a week item again) wins over the old tombstone.
  phone.doc.weekChecks.item1 = { at: 'x' };
  phone.save(T0 + 400);
  delete phone.doc.weekChecks.item1;
  phone.save(T0 + 410);
  sync(phone, cloud, T0 + 420);
  browser.doc.weekChecks.item1 = { at: 'y' };
  browser.save(T0 + 500);
  sync(browser, cloud, T0 + 510);
  check('Re-add: ticking again after an un-tick wins', 'item1' in browser.doc.weekChecks, 'true');
}

// ─── Which week: the course start date ──────────────────────────────────────
{
  // The phone started the course a week before the laptop pressed Start, both before sync existed.
  const cloud = {};
  const laptop = device(doc({ settings: { ...doc().settings, courseStart: '2026-11-23', pathwayStarted: { 'ai-security': '2026-11-24' } } }));
  const phone = device(doc({ settings: { ...doc().settings, courseStart: '2026-11-16', pathwayStarted: { 'ai-security': '2026-11-20', 'secplus-801': '2026-11-18' } } }));
  sync(laptop, cloud, T0);
  sync(phone, cloud, T0 + 10);
  sync(laptop, cloud, T0 + 20);
  check('Week: the earliest course start wins when neither has a change time (phone)', phone.doc.settings.courseStart, '2026-11-16');
  check('Week: and the laptop moves to it too', laptop.doc.settings.courseStart, '2026-11-16');
  check('Week: pathway start dates are combined, earliest each', phone.doc.settings.pathwayStarted, { 'ai-security': '2026-11-20', 'secplus-801': '2026-11-18' });
  check('Week: both devices agree on pathway dates', laptop.doc.settings.pathwayStarted, phone.doc.settings.pathwayStarted);
  const ab = mergeStates(laptop.state(), phone.state(), T0);
  check('Week: the rule gives the same answer in either order', sameState(ab, mergeStates(phone.state(), laptop.state(), T0)), 'true');
  // Restarting the course on purpose later is a recorded change, and wins.
  laptop.doc.settings.courseStart = '2026-11-25';
  laptop.save(T0 + 100);
  sync(laptop, cloud, T0 + 110);
  sync(phone, cloud, T0 + 120);
  check('Week: a deliberate new start date wins over the earlier one', phone.doc.settings.courseStart, '2026-11-25');
}

// ─── Merge laws: order does not matter, and merging twice changes nothing ────
{
  const a = device(doc({ sessions: [{ id: 'x', minutes: 1, updatedAt: '2026-11-01T00:00:00Z' }] }));
  const b = device(doc({ sessions: [{ id: 'x', minutes: 2, updatedAt: '2026-11-01T00:00:00Z' }, { id: 'y', minutes: 3 }] }));
  a.doc.people = [{ id: 'p', name: 'A' }]; a.save(T0);
  b.doc.people = []; b.doc.tallies = [{ id: 't' }]; b.save(T0 + 1);
  const ab = mergeStates(a.state(), b.state(), T0 + 2);
  const ba = mergeStates(b.state(), a.state(), T0 + 2);
  check('Laws: merging A with B equals merging B with A', sameState(ab, ba), 'true');
  check('Laws: merging the result again changes nothing', sameState(mergeStates(ab, a.state(), T0 + 2), ab), 'true');
  check('Laws: a tie with no times is settled the same way everywhere', ab.entries.sessions.x.minutes, ba.entries.sessions.x.minutes);
}

// ─── Test mode stays on its device ───────────────────────────────────────────
{
  const cloud = {};
  const a = device(doc({ lessonAnswers: { q: { answers: ['real'], updatedAt: '2026-11-01T00:00:00Z' } } }));
  sync(a, cloud, T0);
  const b = device(doc({ lessonAnswers: { q: { answers: ['test'], testMode: true, testPrev: { answers: ['old real'] } } }, sessions: [{ id: 'tm', testMode: true }] }));
  sync(b, cloud, T0 + 10);
  check('Test mode: a test answer is kept on its own device', b.doc.lessonAnswers.q.answers[0], 'test');
  check('Test mode: its real answer underneath is brought up to date', b.doc.lessonAnswers.q.testPrev.answers[0], 'real');
  check('Test mode: a test session is kept on its own device', b.doc.sessions.map((s) => s.id), ['tm']);
  check('Test mode: and never uploaded', Object.keys(cloud.state.entries.sessions).length, 0);
}

// ─── Flashcards each device seeded itself ────────────────────────────────────
{
  const d = doc({
    cards: [{ id: 'random-1', seedId: 'oauth-1', front: 'Q' }, { id: 'mine', front: 'My card' }],
    cardReviews: [{ id: 'r1', cardId: 'random-1' }, { id: 'r2', cardId: 'mine' }],
  });
  check('Cards: seed cards get the same id on every device', canonicalCardIds(d), 'true');
  check('Cards: the seed card id', d.cards[0].id, 'seed-oauth-1');
  check('Cards: its ratings move with it', d.cardReviews[0].cardId, 'seed-oauth-1');
  check('Cards: your own cards keep their id', d.cards[1].id, 'mine');
  check('Cards: running it again changes nothing', canonicalCardIds(d), 'false');
}

// ─── Odds and ends ───────────────────────────────────────────────────────────
check('Fallback time: an ISO updatedAt', fallbackTime({ updatedAt: '2026-11-20T10:00:00Z' }), T0);
check('Fallback time: a millisecond timestamp value', fallbackTime(T0), T0);
check('Fallback time: unknown is 0', fallbackTime({ minutes: 3 }), 0);
check('State check: rejects other data', stateProblems({ hello: 1 }).length, 1);
check('State check: accepts a real state', stateProblems(toState(doc(), emptyMeta(), 5)).length, 0);
check('Stable text: key order does not matter', stableStringify({ b: 1, a: [2, { d: 1, c: 0 }] }) === stableStringify({ a: [2, { c: 0, d: 1 }], b: 1 }), 'true');
{
  const old = { format: 'atlas-sync', v: 1, entries: {}, t: {}, del: { sessions: { gone: T0 - 500 * 86400000 } } };
  const m = mergeStates(old, toState(doc(), emptyMeta(), 5), T0);
  check('Tombstones: very old ones are forgotten', Object.keys(m.del.sessions).length, 0);
}

// ─── Encryption (Web Crypto; runs in Node 20+ and browsers) ──────────────────
{
  const { newSecret, cleanSecret, groupedSecret, deriveKeys, sealState, openState } = await import('./sync-crypto.js');
  const secret = newSecret();
  check('Code: 43 URL-safe characters', /^[A-Za-z0-9_-]{43}$/.test(secret), 'true');
  check('Code: two new codes differ', newSecret() === secret, 'false');
  check('Code: typed with spaces is accepted', cleanSecret(groupedSecret(secret)), secret);
  check('Code: a pasted pairing link is accepted', cleanSecret(`https://marva-a.github.io/atlas/#pair/${secret}`), secret);
  check('Code: a short code is refused', cleanSecret(secret.slice(1)), '');
  const k1 = await deriveKeys(secret);
  const k2 = await deriveKeys(secret);
  check('Keys: the same code gives the same vault on every device', k1.vaultId === k2.vaultId && k1.authToken === k2.authToken, 'true');
  check('Keys: the vault id is 32 hex characters', /^[0-9a-f]{32}$/.test(k1.vaultId), 'true');
  check('Keys: the access key is not the vault id', k1.authToken.includes(k1.vaultId), 'false');
  const state = toState(doc({ lessonsDone: { 'w1-d1': { at: 'x', done: true } }, people: [{ id: 'p', name: 'Private name' }] }), emptyMeta(), 5);
  const sealed = await sealState(state, k1);
  check('Seal: the private name is not readable in the upload', sealed.includes('Private name'), 'false');
  check('Seal: unlocks with the same code', stableStringify(await openState(sealed, k2)) === stableStringify(state), 'true');
  const other = await deriveKeys(newSecret());
  const fails = async (fn) => { try { await fn(); return 'opened'; } catch { return 'refused'; } };
  check('Seal: a different code cannot unlock it', await fails(() => openState(sealed, other)), 'refused');
  const env = JSON.parse(sealed);
  const flipped = Buffer.from(env.ct, 'base64'); flipped[10] ^= 1;
  check('Seal: a changed copy is refused', await fails(() => openState(JSON.stringify({ ...env, ct: flipped.toString('base64') }), k1)), 'refused');
  check('Seal: a copy moved to another vault is refused', await fails(() => openState(sealed, { ...k1, vaultId: other.vaultId })), 'refused');
}

// ─── Pairing with an 8-digit code ────────────────────────────────────────────
{
  const { newPairCode, cleanPairCode, groupedPairCode, pairId, makeOffer, sealForOffer, openForOffer } = await import('./sync-pair.js');
  const code = newPairCode();
  check('Pair code: 8 digits', /^\d{8}$/.test(code), 'true');
  check('Pair code: typed with a space is accepted', cleanPairCode(groupedPairCode(code)), code);
  check('Pair code: 7 digits is refused', cleanPairCode('1234 567'), '');
  check('Pair code: the same code finds the same pairing', (await pairId(code)) === (await pairId(code)), 'true');
  check('Pair code: the service never sees the code itself', (await pairId(code)).includes(code), 'false');
  const offer = await makeOffer(code);
  const secret = 'S'.repeat(43);
  const sealed = await sealForOffer(secret, offer.pub, code, offer.id);
  check('Pairing: the sync code is not readable in transit', sealed.includes(secret), 'false');
  check('Pairing: the new device unlocks the sync code', await openForOffer(sealed, offer), secret);
  const fails = async (fn) => { try { await fn(); return 'opened'; } catch { return 'refused'; } };
  const other = await makeOffer(code);
  check('Pairing: another device with the same code cannot unlock it', await fails(() => openForOffer(sealed, other)), 'refused');
  const wrongCode = await sealForOffer(secret, offer.pub, '00000000', offer.id);
  check('Pairing: locked with a different code, it cannot be unlocked', await fails(() => openForOffer(wrongCode, offer)), 'refused');
}

export { results };

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('sync-selftest.js')) {
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ` (got ${r.actual}, expected ${r.expected})`}`);
  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}
