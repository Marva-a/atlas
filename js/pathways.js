// Choosing a pathway: selecting, starting, switching, leaving and finishing, and what the other pages show as a result.
import * as store from './store.js';
import { esc, announce, nav, plural } from './ui.js';
import { addDays, vancouverDate, formatShort } from './dates.js';
import { syncPlanStart } from './course.js';
import { checkForContent, planContent } from './content.js';
import { CORE_ID, needsConfirmToSwitch, resumeDay } from './pathway-logic.js';
import { courseChoices, listedPathways, pathwayAllLessons, lessonRowHtml, startPromptHtml } from './lessons.js';

const STATE_LABELS = { selected: 'Selected', active: 'In progress', paused: 'Paused', complete: 'Complete' };

let confirming = null; // { kind: 'switch' | 'leave', id }: the question open on a card
let changed = null; // the pathway that just changed, so only its card animates
let install = { busy: false, failed: false };
let refresh = () => {};
export function setPathwayRefresh(fn) { refresh = fn; }

const settings = () => store.getSettings();
const find = (id) => courseChoices().find((c) => c.id === id) ?? null;

/** The pathway you are on, or null. */
export function activeCourse() {
  const id = settings().activePathway;
  return id ? find(id) : null;
}

/** The action buttons for a pathway in its current state. */
function controlsHtml(c) {
  const name = `<span class="visually-hidden">: ${esc(c.title)}</span>`;
  const activeId = settings().activePathway;
  if (c.state === 'selected') {
    const waiting = c.needsInstall;
    const startLabel = c.id === CORE_ID ? (c.done ? `Resume at Day ${c.next?.day ?? 1}` : 'Start today') : (c.done ? 'Resume' : 'Start');
    return `${waiting && install.failed ? `<p class="status--behind path-note">The lessons could not be added. Check your connection. <button type="button" class="link-button" data-action="pathway-install" data-path="${esc(c.id)}">Try again</button></p>` : ''}
      <div class="button-row path-actions">
        <button type="button" class="button--primary" data-action="pathway-start" data-path="${esc(c.id)}" ${waiting ? 'disabled' : ''}>${waiting && !install.failed ? 'Adding the lessons…' : startLabel}${name}</button>
        <button type="button" data-action="pathway-unselect" data-path="${esc(c.id)}">Unselect${name}</button>
      </div>`;
  }
  if (c.state === 'active') {
    return `<div class="button-row path-actions">
        ${c.next ? `<a class="button button--primary" href="${c.next.href}">${c.id === CORE_ID ? 'Go to Today' : c.done ? 'Continue' : 'Open first lesson'}${name}</a>` : ''}
        <button type="button" data-action="pathway-leave" data-path="${esc(c.id)}">Leave${name}</button>
      </div>`;
  }
  if (c.state === 'complete') {
    return `<div class="button-row path-actions">
        ${c.id === activeId ? `<button type="button" class="button--primary" data-action="pathway-finish" data-path="${esc(c.id)}">Choose your next pathway</button>` : ''}
        <a class="button" href="${c.href}">Review lessons${name}</a>
      </div>`;
  }
  return `<div class="button-row path-actions">
      <button type="button" data-action="pathway-select" data-path="${esc(c.id)}">${activeId ? 'Switch to this' : c.state === 'paused' ? 'Select again' : 'Select'}${name}</button>
    </div>`;
}

function confirmHtml(c) {
  if (confirming?.id !== c.id) return '';
  const active = activeCourse();
  const leaving = confirming.kind === 'leave' ? c : active;
  const calendar = leaving?.id === CORE_ID ? ' Its calendar stops, and you can resume from your next lesson later.' : '';
  const heading = confirming.kind === 'leave' ? `Leave ${c.title}?` : `Switch to ${c.title}?`;
  return `<div class="path-confirm" role="group" aria-label="${esc(heading)}">
      <p><strong>${esc(heading)}</strong> ${confirming.kind === 'leave' ? 'Your progress stays saved.' : `Your progress in ${esc(leaving?.title ?? 'your current pathway')} stays saved.`}${calendar}</p>
      <div class="button-row">
        <button type="button" class="button--primary" data-action="pathway-confirm" data-path="${esc(c.id)}">${confirming.kind === 'leave' ? 'Leave pathway' : 'Switch pathway'}</button>
        <button type="button" data-action="pathway-cancel" data-path="${esc(c.id)}">Cancel</button>
      </div>
    </div>`;
}

function tagHtml(c) {
  const label = STATE_LABELS[c.state];
  if (!label) return '';
  const finished = c.state === 'complete' ? settings().pathwayFinished?.[c.id] : null;
  return `<p class="path-tag path-tag--${c.state}"><span class="path-tag__mark" aria-hidden="true"></span>${label}${finished ? ` · ${esc(formatShort(finished))}` : ''}</p>`;
}

function barHtml(c) {
  if (!c.total || !(c.done || c.state === 'active')) return '';
  const pct = Math.round((c.done / c.total) * 100);
  return `<div class="progress path-bar" role="img" aria-label="${c.done} of ${c.total} lessons complete"><span style="width:${pct}%"></span></div>
    <p class="path-count">${c.done} of ${plural(c.total, 'lesson', 'lessons')} complete</p>`;
}

const changedClass = (c) => (changed === c.id ? ' path-card--changed' : '');

/** One pathway as a card. Its look follows its state. */
export function pathwayCardHtml(c) {
  return `<li class="path-card path-card--${c.state}${changedClass(c)}" data-path="${esc(c.id)}">
    ${tagHtml(c)}
    <h3><a href="${c.href}">${esc(c.title)}</a></h3>
    <p class="path-card__best">${esc(c.best)}</p>
    ${c.facts ? `<p class="course-choice__facts">${esc(c.facts)}</p>` : ''}
    ${barHtml(c)}
    ${controlsHtml(c)}
    ${confirmHtml(c)}
  </li>`;
}

/** The same controls at the top of a pathway's own page. */
export function pathwayControlHtml(id) {
  const c = find(id);
  if (!c) return '';
  const lead = { available: 'Select this pathway to make it the one you are working on.', paused: 'Your progress is saved. Select it to carry on.', selected: 'You have selected this pathway. Start when you are ready.', active: 'This is the pathway you are working on.', complete: 'You have finished every lesson in this pathway.' }[c.state];
  return `<section class="path-control path-control--${c.state}${changedClass(c)}" data-path="${esc(c.id)}" aria-label="Your status on this pathway">
    ${tagHtml(c)}
    <p class="path-control__lead">${lead}</p>
    ${controlsHtml(c)}
    ${confirmHtml(c)}
  </section>`;
}

/** A line on Plan, Learn and Progress saying which pathway they are showing. */
export function pathwayStripHtml() {
  const c = activeCourse();
  if (!c) return '';
  return `<p class="path-strip path-strip--${c.state}"><span class="path-strip__dot" aria-hidden="true"></span><span><strong>${esc(c.title)}</strong> · ${STATE_LABELS[c.state]}</span> <a href="#learn/pathways">Change</a></p>`;
}

const loadingHtml = (c) => (c.loadFailed
  ? `<h1 id="day-heading" tabindex="-1">${esc(c.title)}</h1><p>Your pathway did not load. Check your connection, then <button type="button" class="link-button" data-action="cert-retry">try again</button>.</p>`
  : `<h1 id="day-heading" tabindex="-1">Loading your pathway…</h1>`);

function completeHeroHtml(c, dateText) {
  const note = c.id === 'secplus-801'
    ? `<p>You have worked through every lesson. Exam readiness is measured separately, from your quizzes, labs and mock exams. <a href="#cert/ready">Check your readiness</a>.</p>`
    : '<p>Every lesson is done. Your answers and progress stay here whenever you want to look back.</p>';
  return `<section class="path-hero path-hero--complete" data-path="${esc(c.id)}">
    <p class="eyebrow">${esc(dateText)}</p>
    <svg class="path-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28"/><path d="M20 33l8.5 8.5L45 24"/></svg>
    <h1 id="day-heading" tabindex="-1">You finished ${esc(c.title)}</h1>
    ${note}
    ${controlsHtml(c)}
  </section>`;
}

function readyHeroHtml(c, dateText) {
  const what = c.id === CORE_ID
    ? (c.done ? `Your calendar picks up at Day ${c.next?.day ?? 1}, the first lesson you have not finished.` : 'Starting makes today Day 1, and your calendar begins.')
    : 'It runs at your own pace, with no due dates. Today will show your next lesson.';
  const others = courseChoices().filter((x) => x.id !== c.id);
  return `<section class="path-hero path-hero--selected${changedClass(c)}" data-path="${esc(c.id)}">
      <p class="eyebrow">${esc(dateText)}</p>
      ${tagHtml(c)}
      <h1 id="day-heading" tabindex="-1">Ready to start ${esc(c.title)}?</h1>
      <p class="lesson-summary">${esc(what)}</p>
      ${controlsHtml(c)}
    </section>
    <h2 class="small-label course-group">Or pick a different one</h2>
    <ul class="course-list">${others.map(pathwayCardHtml).join('')}</ul>`;
}

function homeHeroHtml(c, dateText) {
  if (c.loading || c.loadFailed) return loadingHtml(c);
  const startedToday = settings().pathwayStarted?.[c.id] === vancouverDate();
  return `<section class="path-hero path-hero--active${changedClass(c)}" data-path="${esc(c.id)}">
    <p class="eyebrow">${esc(dateText)}</p>
    ${tagHtml(c)}
    <h1 id="day-heading" tabindex="-1">${esc(c.next.title)}</h1>
    <p class="meta">${esc(c.title)}${c.next.meta ? ` · ${esc(c.next.meta)}` : ''}</p>
    ${startedToday && !c.done ? '<p class="path-note--ok">You started today. There are no due dates, so go at a pace that works for you.</p>' : ''}
    ${barHtml(c)}
    <div class="button-row"><a class="button button--primary" href="${c.next.href}">${c.done ? 'Continue this lesson' : 'Open first lesson'}</a></div>
  </section>`;
}

/** What Today shows for the chosen pathway, or null when the regular calendar or the chooser should show. */
export function pathwayTodayHtml(dateText) {
  const c = activeCourse();
  if (!c) return null;
  if (c.state === 'complete') return completeHeroHtml(c, dateText);
  if (c.state === 'selected') return readyHeroHtml(c, dateText);
  return c.id === CORE_ID ? null : homeHeroHtml(c, dateText);
}

const startButtonHtml = (c) => `<button type="button" class="button--primary" data-action="pathway-start" data-path="${esc(c.id)}" ${c.needsInstall ? 'disabled' : ''}>Start ${esc(c.title)}</button>`;

/** What a page's "start" prompt offers: start the one you selected, or go and choose one. */
export function startPromptAction() {
  const c = activeCourse();
  return c?.state === 'selected' ? { html: startButtonHtml(c) } : undefined;
}

function secplusWeeksHtml(c) {
  const current = c.weeks.find((w) => w.total && w.done < w.total)?.n;
  return `<ol class="steps-list lessons-list">${c.weeks.map((w) => {
    const complete = w.total > 0 && w.done === w.total;
    const here = w.n === current;
    return `<li class="step step--${complete ? 'done' : 'todo'} ${here ? 'step--next' : ''}">
      <a class="step__row" href="#cert/week/${w.n}">
        <span class="step__mark" aria-hidden="true">${complete ? '✓' : w.n}</span>
        <span class="step__body"><span class="step__title">${esc(w.title)}</span><span class="step__meta">Week ${w.n} · ${w.done} of ${plural(w.total, 'lesson', 'lessons')}${here ? ' · You are here' : ''}</span></span>
        <span class="step__go" aria-hidden="true">›</span>
      </a></li>`;
  }).join('')}</ol>`;
}

function ownLessons(c) {
  const p = listedPathways().find((x) => x.id === c.id);
  return p ? pathwayAllLessons(p).all : [];
}

function ownLessonsHtml(c) {
  return `<ol class="steps-list lessons-list">${ownLessons(c).map((l) => lessonRowHtml(l, { mark: String(l.order), meta: `Lesson ${l.order}`, upNext: c.next?.id === l.id })).join('')}</ol>`;
}

function secplusLessonsHtml(c) {
  return c.weeks.filter((w) => w.total).map((w) => `
    <h2 class="small-label lessons-week">Week ${w.n} · ${esc(w.title)}</h2>
    <ol class="steps-list lessons-list">${w.lessons.map((l) => `
      <li class="step step--${l.done ? 'done' : 'todo'} ${c.next?.id === l.id ? 'step--next' : ''}">
        <a class="step__row" href="#cert/lesson/${esc(l.id)}">
          <span class="step__mark" aria-hidden="true">${l.done ? '✓' : l.n}</span>
          <span class="step__body"><span class="step__title">${esc(l.title)}</span><span class="step__meta">Lesson ${l.n} · about ${l.min} min${c.next?.id === l.id ? ' · Up next' : ''}</span></span>
          <span class="visually-hidden"> (${l.done ? 'complete' : c.next?.id === l.id ? 'up next' : 'not started'})</span>
          <span class="step__go" aria-hidden="true">›</span>
        </a></li>`).join('')}</ol>`).join('');
}

const selfPaced = (c) => c.state === 'active' || c.state === 'complete';

/** Plan for a self-paced pathway, or for a pathway selected but not started. Null means the regular page. */
export function pathwayPlanHtml() {
  const c = activeCourse();
  if (!c) return null;
  if (c.state === 'selected') {
    return `<h1 id="day-heading" tabindex="-1">Plan</h1>${startPromptHtml({
      heading: 'Your plan begins when you start',
      text: c.id === CORE_ID ? 'The 60-day course has a calendar for every day, and it appears here from the day you start.' : 'This pathway is self-paced, so your plan is a list of what comes next, with no dates to keep up with.',
      action: startPromptAction(),
    })}`;
  }
  if (c.id === CORE_ID || !selfPaced(c)) return null;
  if (c.loading || c.loadFailed) return loadingHtml(c);
  const body = c.weeks ? secplusWeeksHtml(c) : ownLessonsHtml(c);
  return `<h1 id="day-heading" tabindex="-1">Plan</h1>
    <p class="meta page-intro">Self-paced, with no due dates. ${c.done} of ${plural(c.total, 'lesson', 'lessons')} complete.</p>
    ${body}`;
}

/** Learn's overview while you are on a self-paced pathway. */
export function pathwayLearnHtml() {
  const c = activeCourse();
  if (!c || c.id === CORE_ID || !selfPaced(c)) return null;
  if (c.loading || c.loadFailed) return loadingHtml(c);
  const links = c.weeks
    ? [['#cert/curriculum', 'Curriculum'], ['#cert/labs', 'Hands-on labs'], ['#cert/design', 'Product design practice'], ['#cert/exams', 'Practice examinations'], ['#cert/library', 'Reference library and glossary']]
    : [['#learn/lessons', 'All lessons'], ['#learn/cards', 'Flashcards']];
  return `<h1 id="day-heading" tabindex="-1">Learn</h1>
    ${c.next ? `<section class="card card--soft"><h2 class="small-label">Your next lesson</h2>
      <p class="focus-line">${esc(c.next.title)}</p>
      <div class="button-row"><a class="button button--primary" href="${c.next.href}">${c.done ? 'Continue' : 'Open first lesson'}</a></div></section>` : ''}
    <ul class="path-links">${links.map(([href, text]) => `<li><a href="${href}">${esc(text)}</a></li>`).join('')}</ul>`;
}

/** Learn → Lessons while you are on a self-paced pathway. */
export function pathwayLessonsHtml() {
  const c = activeCourse();
  if (!c || c.id === CORE_ID || !selfPaced(c)) return null;
  if (c.loading || c.loadFailed) return loadingHtml(c);
  return `<h1 id="day-heading" tabindex="-1">Lessons</h1>
    <p class="meta page-intro"><strong>${c.done} of ${plural(c.total, 'lesson', 'lessons')}</strong> complete in ${esc(c.title)}.</p>
    ${barHtml({ ...c, done: c.done, state: 'active' }).split('<p class="path-count">')[0]}
    ${c.weeks ? secplusLessonsHtml(c) : ownLessonsHtml(c)}`;
}

/** The card Progress shows for a self-paced pathway. */
export function pathwayProgressCardHtml() {
  const c = activeCourse();
  if (!c || c.id === CORE_ID || !selfPaced(c)) return null;
  if (c.loading || c.loadFailed) return loadingHtml(c);
  const separate = c.design
    ? `<div class="cert-measures">
        <section class="card cert-measure"><h2 class="small-label">Security+ technical mastery</h2><p class="cert-measure__n">${c.done} of ${c.total}</p><p class="meta">lessons complete</p><a href="#cert/ready">Exam readiness</a></section>
        <section class="card cert-measure"><h2 class="small-label">Product design competency</h2><p class="cert-measure__n">${c.design.assessed} of ${c.design.total}</p><p class="meta">exercises assessed</p><a href="#cert/design">Design practice</a></section>
      </div>
      <p class="meta">These two are measured separately and never combined. <a href="#cert/progress">Open the full dashboard</a>.</p>`
    : `<section class="card">${barHtml(c)}</section>`;
  return separate;
}

async function addLessons() {
  if (install.busy) return;
  install = { busy: true, failed: false };
  const result = await checkForContent().catch(() => ({ content: null }));
  if (result.content) {
    store.applyContentPlan(planContent(result.content, store.getData()));
    install = { busy: false, failed: false };
    syncPlanStart();
    announce('The lessons are ready.');
  } else {
    install = { busy: false, failed: true };
    announce('The lessons could not be added. Check your connection and try again.');
  }
  refresh();
}

/** Takes a pathway off the calendar or out of "started". Lesson progress is left alone. */
function stopRunning(id) {
  if (id === CORE_ID) {
    store.setCourseStart(null);
    syncPlanStart();
    return;
  }
  const { [id]: _gone, ...rest } = settings().pathwayStarted ?? {};
  store.updateSettings({ pathwayStarted: rest });
}

function markFinished(c) {
  store.updateSettings({ pathwayFinished: { ...(settings().pathwayFinished ?? {}), [c.id]: vancouverDate() } });
}

function select(id) {
  const active = activeCourse();
  if (active && active.id !== id) {
    if (active.state === 'complete') markFinished(active);
    stopRunning(active.id);
  }
  store.updateSettings({ activePathway: id });
  confirming = null;
  showChanged(id);
  const c = find(id);
  announce(`${c.title} selected. Start when you are ready.`);
  if (c.needsInstall) addLessons();
}

function clearActive(c, message) {
  stopRunning(c.id);
  store.updateSettings({ activePathway: null });
  confirming = null;
  showChanged(c.id);
  announce(message);
}

/** Marks a card for one entrance animation, ending once this redraw has happened. */
function showChanged(id) {
  changed = id;
  setTimeout(() => { if (changed === id) changed = null; }, 0);
}

const focusOn = (id) => `[data-path="${id}"] .path-actions .button--primary, [data-path="${id}"] .path-actions button, #day-heading`;

export const pathwayActions = {
  'pathway-select': (el) => {
    const { path: id } = el.dataset;
    if (needsConfirmToSwitch(activeCourse(), id)) {
      confirming = { kind: 'switch', id };
      return `[data-path="${id}"] [data-action="pathway-confirm"]`;
    }
    select(id);
    return focusOn(id);
  },
  'pathway-unselect': (el) => {
    const c = find(el.dataset.path);
    if (!c) return null;
    clearActive(c, `${c.title} unselected.`);
    return focusOn(c.id);
  },
  'pathway-start': (el) => {
    const c = find(el.dataset.path);
    if (!c || c.needsInstall) return null;
    if (c.id === CORE_ID) {
      store.setCourseStart(addDays(vancouverDate(), -(resumeDay(c.next?.day) - 1)));
      syncPlanStart();
    } else {
      store.updateSettings({ pathwayStarted: { ...(settings().pathwayStarted ?? {}), [c.id]: vancouverDate() } });
    }
    confirming = null;
    showChanged(c.id);
    announce(`${c.title} started.`);
    nav.focus = '#day-heading';
    location.hash = '#today';
    return '#day-heading';
  },
  'pathway-leave': (el) => {
    confirming = { kind: 'leave', id: el.dataset.path };
    return `[data-path="${el.dataset.path}"] [data-action="pathway-confirm"]`;
  },
  'pathway-confirm': (el) => {
    const { path: id } = el.dataset;
    if (confirming?.kind === 'leave') {
      const c = find(id);
      clearActive(c, `You left ${c.title}. Your progress is saved.`);
    } else select(id);
    return focusOn(id);
  },
  'pathway-cancel': (el) => {
    confirming = null;
    return focusOn(el.dataset.path);
  },
  'pathway-finish': (el) => {
    const c = find(el.dataset.path);
    if (!c) return null;
    markFinished(c);
    clearActive(c, `${c.title} is complete. Choose what comes next.`);
    nav.focus = '#day-heading';
    location.hash = '#today';
    return '#day-heading';
  },
  'pathway-install': () => {
    addLessons();
    return null;
  },
};
