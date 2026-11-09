// Course home: where you are in the 9 weeks, and what to do next.
// Everything shown is worked out from what you logged. Nothing is typed in.
import * as store from './store.js';
import { esc, today, announce, nav } from './ui.js';
import { formatShort, addDays, vancouverDate } from './dates.js';
import { planDayFor, getDayContext } from './plan.js';
import { PLAN_START, PLAN_END, ITEM_KIND_LABELS, WEEKS, ROADMAP_START, setPlanStartDate } from './plan-data.js';
import { courseProgress } from './progress.js';
import { setWeek } from './week.js';


/** True until you press Start. While testing with a test date, the original calendar is used instead. */
export function courseNotStarted() {
  const s = store.getSettings();
  return !s.courseStart && !s.testDate.enabled;
}

/** Puts the calendar on the day you chose. Before you choose, Day 1 always sits one day ahead, so nothing is due. */
export function syncPlanStart() {
  const s = store.getSettings();
  if (s.courseStart) setPlanStartDate(s.courseStart);
  else if (s.testDate.enabled) setPlanStartDate(ROADMAP_START);
  else setPlanStartDate(addDays(vancouverDate(), 1));
}

/** The title of Plan with one line of where you are overall and what the page is for. */
export function planIntroHtml() {
  const date = today();
  const p = courseProgress(store.getData(), { today: date });
  const dayNumber = planDayFor(date);
  const where = courseNotStarted()
    ? 'Not started yet: choose it in Learn → Pathways'
    : date < PLAN_START
    ? `Starts ${formatShort(PLAN_START)}`
    : date > PLAN_END
      ? 'The 60 days are over'
      : dayNumber ? `Day ${dayNumber} of 60` : formatShort(date);
  return `
    <h1 id="day-heading" tabindex="-1">Plan</h1>
    <p class="meta page-intro">${esc(where)} · ${p.requiredTicked} of ${p.requiredTotal} required items done</p>`;
}

/**
 * "Next up" (only once you have logged a session) or "Start with Week 1". `shownWeek` is the week on screen,
 * so the Start card does not offer a button to a week you are already looking at.
 */
export function nextUpHtml(shownWeek) {
  const date = today();
  const data = store.getData();
  const p = courseProgress(data, { today: date });
  const ctx = getDayContext(date, store.getSettings());
  const studyToday = ['study', 'bridge', 'applications'].includes(ctx.kind);

  if (!data.sessions.length) {
    return `
      <section class="card card--soft" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Start with Week 1</h2>
        <p>${esc(WEEKS[0].title)}. Log your first session on Today and this page will show where to continue.</p>
        ${shownWeek === 1 ? '' : '<div class="button-row"><button type="button" class="button--primary" data-action="course-open-week" data-week="1">Open Week 1</button></div>'}
      </section>`;
  }
  if (!p.next) {
    return `
      <section class="card card--soft" aria-labelledby="next-up-heading">
        <h2 id="next-up-heading">Next up</h2>
        <p class="status-ok">Every required item in every week is ticked.</p>
      </section>`;
  }
  const why = p.next.state === 'current' ? 'The first required item you have not ticked this week.'
    : p.next.state === 'past' ? 'An earlier week still has required items open.' : 'This week has not started yet.';
  return `
    <section class="card card--soft" aria-labelledby="next-up-heading">
      <h2 id="next-up-heading">Next up</h2>
      <p class="focus-line">${esc(p.next.text)}</p>
      <p class="meta">Week ${p.next.weekNumber} · ${esc(ITEM_KIND_LABELS[p.next.kind])}. ${why}</p>
      <div class="button-row">
        ${p.next.weekNumber !== shownWeek ? `<button type="button" data-action="course-open-week" data-week="${p.next.weekNumber}">Open Week ${p.next.weekNumber}</button>` : ''}
        ${studyToday ? '<button type="button" class="button--primary" data-action="flow-start-from-home">Start today’s session</button>' : ''}
      </div>
    </section>`;
}

/** Makes today Day 1 and opens Today. */
function startCourseToday() {
  store.setCourseStart(vancouverDate());
  syncPlanStart();
  announce('The 60-day course starts today. This is Day 1.');
  nav.focus = '#day-heading';
  location.hash = '#today';
  return '#day-heading';
}

export const courseActions = {
  'course-start': startCourseToday,
  'course-restart': () => {
    if (!window.confirm('Restart the 60-day calendar with today as Day 1? Completed lessons and saved work stay as they are.')) return null;
    return startCourseToday();
  },
  'course-open-week': (el) => {
    setWeek(Number(el.dataset.week));
    return '#week-heading';
  },
};
