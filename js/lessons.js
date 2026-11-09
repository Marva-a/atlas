// Daily lessons: plain-language context for a study day, from a lessons pack.
// A lesson has a summary, why it matters, key ideas, words, timed steps (each can point at a resource in
// the Library), what to skim or skip, and check-yourself questions with a box that saves your answer.
// Lessons are content: you cannot edit them, and your answers are stored apart so an update never loses them.
import * as store from './store.js';
import { esc, announce, testMode, nav, plural, today } from './ui.js';
import { formatShort } from './dates.js';
import { planDayFor } from './plan.js';
import { nextLessonOf } from './progress.js';
import { showResourceInLibrary } from './resources.js';
import { startCardDraft } from './flashcards.js';
import { LESSON_LEVEL_LABELS } from './content.js';
import { certPathwaySummary } from './cert.js';
import { lessonVisualsHtml } from './visuals.js';
import { CORE_ID, pathwayState } from './pathway-logic.js';
import { activeCourse, pathwayCardHtml, pathwayControlHtml, pathwayLessonsHtml, startPromptAction } from './pathways.js';

const pending = new Map(); // "lessonId:index" → text not saved yet
const timers = new Map();
const openChecks = new Set(); // "lessonId:index" of the good answers you opened (kept across redraws)

const key = (lessonId, index) => `${lessonId}:${index}`;

function setStatus(lessonId, index, text) {
  const el = document.getElementById(`las-${lessonId}-${index}`);
  if (el) el.textContent = text;
}

function save(lessonId, index) {
  const k = key(lessonId, index);
  if (!pending.has(k)) return;
  const text = pending.get(k);
  pending.delete(k);
  clearTimeout(timers.get(k));
  timers.delete(k);
  const ok = store.setLessonAnswer(lessonId, index, text, testMode());
  setStatus(lessonId, index, ok ? 'Saved' : 'Could not save: this browser blocked saving.');
}

/** Saves every answer typed a moment ago (called before the page redraws or closes). */
export function flushLessonAnswers() {
  for (const k of [...pending.keys()]) {
    const [lessonId, index] = [k.slice(0, k.lastIndexOf(':')), Number(k.slice(k.lastIndexOf(':') + 1))];
    save(lessonId, index);
  }
}

/** Typing in an answer box: saved a moment after you stop. */
export function handleLessonInput(target) {
  const lessonId = target.dataset?.lessonAnswer;
  if (!lessonId) return false;
  const index = Number(target.dataset.q);
  const k = key(lessonId, index);
  pending.set(k, target.value);
  setStatus(lessonId, index, '');
  clearTimeout(timers.get(k));
  timers.set(k, setTimeout(() => save(lessonId, index), 600));
  return true;
}

const minutesText = (n) => `${n} min`;

/** One lesson. `level` is the heading level of its title (2 inside Today, 1 on its own page). */
export function lessonHtml(lesson, { level = 2 } = {}) {
  const h = `h${level}`;
  const sub = `h${level + 1}`;
  const answers = store.getLessonAnswers(lesson.id);
  const stepTotal = lesson.steps.reduce((n, s) => n + s.minutes, 0);
  const steps = lesson.steps.map((s) => {
    const r = s.resourceId ? store.getResource(s.resourceId) : null;
    const link = s.resourceId
      ? r
        ? ` <a href="#learn/library" data-resource-link="${esc(r.id)}">${esc(r.title)}<span class="visually-hidden"> (open in the Library)</span></a>`
        : ' <span class="meta">(its resource is not in your Library yet: check for new content in Learn)</span>'
      : '';
    return `<li><span class="step-minutes">${esc(minutesText(s.minutes))}</span><span class="step-text">${esc(s.text)}${link}</span></li>`;
  }).join('');
  return `
    <section class="card lesson" aria-labelledby="lesson-title-${esc(lesson.id)}" data-note-scope="lesson:${esc(lesson.id)}" data-note-title="${esc(lesson.title)}" data-note-href="${esc(lesson.pathway ? `#path/${lesson.pathway}/${lesson.order}` : `#lesson/${lesson.day}${(lesson.part ?? 1) > 1 ? `/${lesson.part}` : ''}`)}" data-card-ref="${esc((lesson.pathway ? `Pathway lesson ${lesson.order}: ${lesson.title}` : `Lesson, Day ${lesson.day}: ${lesson.title}`).slice(0, 300))}" data-card-week="${esc(lesson.week ?? '')}">
      <p class="eyebrow">${lessonPlaceText(lesson)}${lesson.level ? ` · ${esc(LESSON_LEVEL_LABELS[lesson.level] ?? '')}` : ''} · about ${esc(minutesText(lesson.plannedMinutes))}</p>
      <${h} id="lesson-title-${esc(lesson.id)}" tabindex="-1">${esc(lesson.title)}</${h}>
      <p class="lesson-summary">${esc(lesson.inOneSentence)}</p>
      <p class="lesson-objective"><strong>By the end, you can:</strong> ${esc(lesson.youCanNow)}</p>
      ${lessonVisualsHtml(lesson.id)}

      <${sub} class="lesson__label">Why it matters</${sub}>
      <p>${esc(lesson.whyItMattersToADesigner)}</p>

      <${sub} class="lesson__label">Key ideas</${sub}>
      <ul>${lesson.keyIdeas.map((k) => `<li>${esc(k)}</li>`).join('')}</ul>

      ${lesson.words.length ? `
        <${sub} class="lesson__label">Key terms</${sub}>
        <dl class="words">${lesson.words.map((w) => `<div><dt>${esc(w.term)}</dt><dd>${esc(w.meaning)}</dd></div>`).join('')}</dl>` : ''}

      <${sub} class="lesson__label">Steps <span class="lesson__label-note">${esc(minutesText(stepTotal))}</span></${sub}>
      <ol class="lesson-steps">${steps}</ol>

      <${sub} class="lesson__label">Skim or skip</${sub}>
      <p>${esc(lesson.skipOrSkim)}</p>

      <${sub} class="lesson__label">Check yourself</${sub}>
      <p class="meta">Answer in your own words before you look anything up. Your answer is saved as you type.</p>
      ${lesson.checkYourself.map((q, i) => `
        <div class="field">
          <label for="la-${esc(lesson.id)}-${i}">${esc(q)}</label>
          <textarea id="la-${esc(lesson.id)}-${i}" rows="3" maxlength="4000" data-lesson-answer="${esc(lesson.id)}" data-q="${i}" aria-describedby="las-${esc(lesson.id)}-${i}">${esc(answers[i] ?? '')}</textarea>
          <span class="hint" id="las-${esc(lesson.id)}-${i}" aria-live="polite">${(answers[i] ?? '').trim() ? 'Saved' : 'Saved as you type.'}</span>
        </div>
        ${lookForHtml(lesson, i)}`).join('')}

      ${completeHtml(lesson)}
    </section>`;
}

const isDone = (l) => Boolean(store.lessonDoneAt(l.id));

/** Where a lesson sits: its calendar day (and pathway, if the day belongs to one), or its place in a pathway. */
function lessonPlaceText(lesson) {
  if (lesson.pathway) {
    const p = store.pathwayById(lesson.pathway);
    return `Pathway lesson ${lesson.order}${p ? ` · ${esc(p.title)}` : ''}`;
  }
  const p = store.pathwayForDay(lesson.day);
  const part = (lesson.part ?? 1) > 1 ? `Lesson ${lesson.part} · ` : 'Lesson · ';
  return `${part}Day ${lesson.day}${p ? ` · <a href="#path/${esc(p.id)}">${esc(p.title)} pathway</a>` : ''}`;
}

const lessonHref = (l) => (l.pathway ? `#path/${l.pathway}/${l.order}` : `#lesson/${l.day}${(l.part ?? 1) > 1 ? `/${l.part}` : ''}`);

/** The next lesson after this one: the next not-done one in the same pathway, or in the calendar. */
function nextAfter(lesson) {
  if (lesson.pathway) return store.pathwayLessonsInOrder(lesson.pathway).find((l) => !isDone(l)) ?? null;
  return nextLesson();
}
/** The next lesson to do, in course order, or null when every written lesson is complete. */
export const nextLesson = () => nextLessonOf(store.lessonsInOrder(), isDone);
const dayOf = (iso) => formatShort(new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Vancouver' }));

/**
 * The end of a lesson: one button to complete it; once complete, a quiet note and the next lesson.
 * Completing never depends on the questions being answered: that is your call.
 */
function completeHtml(lesson) {
  const doneAt = store.lessonDoneAt(lesson.id);
  if (!doneAt) {
    return `
      <div class="lesson-complete">
        <button type="button" class="button--primary" data-action="lesson-complete" data-lesson="${esc(lesson.id)}">Complete lesson</button>
      </div>`;
  }
  const next = nextAfter(lesson);
  const nextCta = next
    ? `<a class="button button--primary" href="${lessonHref(next)}">Start next lesson<span class="visually-hidden">: ${esc(next.title)}</span></a>
       <p class="meta">${next.pathway ? `Pathway lesson ${next.order}` : `Day ${next.day}`} · ${esc(next.title)}</p>`
    : lesson.pathway
      ? `<p class="meta">That is every lesson in this pathway. <a href="#learn/pathways">See all pathways</a>.</p>`
      : '<p class="meta">That is every lesson written so far. New ones arrive as course updates.</p>';
  return `
    <div class="lesson-complete lesson-complete--done" id="lesson-done-${esc(lesson.id)}" tabindex="-1">
      <p class="lesson-complete__status"><span class="lesson-complete__mark" aria-hidden="true">✓</span> Lesson complete · ${esc(dayOf(doneAt))}</p>
      ${nextCta}
      <button type="button" class="button--small lesson-complete__undo" data-action="lesson-uncomplete" data-lesson="${esc(lesson.id)}">Mark as not complete</button>
    </div>`;
}

/** The 60-day course's lessons, grouped by week. `next` marks the learner's place; leave it out when no place exists yet. */
function lessonWeeksHtml(all, next = null) {
  return [...new Set(all.map((l) => l.week))].map((w) => `
    <h2 class="small-label lessons-week">Week ${w}</h2>
    <ol class="steps-list lessons-list">
      ${all.filter((l) => l.week === w).map((l) => lessonRowHtml(l, { mark: String(l.day), meta: `Day ${l.day}${(l.part ?? 1) > 1 ? ` · lesson ${l.part}` : ''}`, upNext: next?.id === l.id })).join('')}
    </ol>`).join('');
}

const GHOST_LESSONS = `<div class="ghost-lessons" aria-hidden="true">${'<span><b></b><i></i><i></i></span>'.repeat(3)}</div>`;

function lessonsPromptHtml() {
  const c = activeCourse();
  const selected = c?.state === 'selected';
  return startPromptHtml({
    heading: selected ? 'Start to line up your lessons' : 'Your lessons will line up here',
    text: selected ? `You selected ${c.title}. Start it and this page shows its lessons in order, with your place marked.` : 'Choose a pathway and this page shows its lessons in order, with your place marked.',
    visual: GHOST_LESSONS,
    points: ['The next lesson to open', 'What you have finished', 'How long each lesson takes'],
    action: startPromptAction(),
  });
}

/** Lessons before the 60-day course has begun: nothing is assigned or "up next", and the list is there to look through. */
function lessonsBeforeBeginningHtml(all, state) {
  const weeks = new Set(all.map((l) => l.week)).size;
  const others = '<p class="meta">Other pathways list their lessons on their own pages. See <a href="#learn/pathways">Pathways</a>.</p>';
  const preview = `<details class="lesson-preview">
      <summary>${esc(CORE_COURSE.title)} <span class="meta">${plural(all.length, 'lesson', 'lessons')} · ${plural(weeks, 'week', 'weeks')}</span></summary>
      ${lessonWeeksHtml(all)}
    </details>`;
  if (state === 'started' && !activeCourse()) {
    return `<h1 id="day-heading" tabindex="-1">Lessons</h1>
      <p class="meta page-intro">Your lessons are inside the pathways you have begun.</p>
      ${startedCoursesHtml()}
      <h2 class="small-label course-group">Other lessons to look through</h2>
      ${preview}${others}`;
  }
  return `<h1 id="day-heading" tabindex="-1">Lessons</h1>
    ${lessonsPromptHtml()}
    <h2 class="small-label course-group">Want to look first?</h2>
    <p class="meta">Open any lesson to read it. Nothing starts until you choose a pathway.</p>
    ${preview}${others}`;
}

/** Learn → Lessons: the course as a list, with what is complete and what is up next. */
export function lessonsListView() {
  const all = store.lessonsInOrder();
  const next = nextLesson();
  const done = all.filter(isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const own = pathwayLessonsHtml();
  if (own) return own;
  const state = journeyState();
  const selected = activeCourse()?.state === 'selected';
  // A pathway you selected shows its own lessons once started, so the 60-day list would only be in the way.
  if (!all.length || (selected && activeCourse().id !== CORE_ID)) return `<h1 id="day-heading" tabindex="-1">Lessons</h1>${lessonsPromptHtml()}`;
  if (selected || (!done && (state === 'none' || state === 'started'))) return lessonsBeforeBeginningHtml(all, state);
  return `
    <h1 id="day-heading" tabindex="-1">Lessons</h1>
    ${all.length ? `
      <p class="meta page-intro"><strong>${done} of ${plural(all.length, 'lesson', 'lessons')}</strong> complete. Go at your own pace: finish one, then start the next.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ${next ? `<div class="button-row"><a class="button button--primary" href="${lessonHref(next)}">${done ? 'Continue' : 'Start'}: ${esc(next.title)}</a></div>` : '<p class="status-ok">Every lesson written so far is complete.</p>'}
      ${lessonWeeksHtml(all, next)}
      <p class="meta">More lessons arrive as course updates (Settings → Content). To go deeper in one area, see <a href="#learn/pathways">Pathways</a>.</p>`
    : '<p class="empty-state">No lessons yet. Add the course in <a href="#learn/library">Learn → Overview</a>.</p>'}`;
}

/**
 * What a good answer includes, folded away so you answer first. Opening it is your choice; it never blocks you.
 * From there one click makes the question a flashcard, so it comes back for spaced review.
 */
function lookForHtml(lesson, i) {
  const text = lesson.lookFor?.[i];
  if (!text) return '';
  const k = key(lesson.id, i);
  return `
    <details class="lesson-check" data-lesson-check="${esc(k)}" ${openChecks.has(k) ? 'open' : ''}>
      <summary><span>Compare with an example answer <span class="lesson-check__when">(after you try)</span></span></summary>
      <p class="meta">Check what you wrote against this. Missing a part is normal: add it to your answer in your own words.</p>
      <p class="lesson-check__answer">${esc(text)}</p>
      <button type="button" class="button--small" data-action="lesson-card" data-lesson="${esc(lesson.id)}" data-q="${i}">Make it a flashcard<span class="visually-hidden">: ${esc(lesson.checkYourself[i])}</span></button>
    </details>`;
}

/** Remembers which good answers you opened. Returns true when the event was for one of them. */
export function handleLessonToggle(event) {
  const k = event.target?.dataset?.lessonCheck;
  if (!k) return false;
  if (event.target.open) openChecks.add(k);
  else openChecks.delete(k);
  return true;
}

export const lessonActions = {
  'lesson-complete': (el) => {
    flushLessonAnswers();
    const id = el.dataset.lesson;
    store.setLessonDone(id, true, testMode());
    const lesson = store.lessonById(id);
    const next = lesson ? nextAfter(lesson) : null;
    announce(`Lesson complete.${next ? ` Next: ${next.title}.` : ' That is every lesson written so far.'}`);
    return `#lesson-done-${id}`;
  },
  'lesson-uncomplete': (el) => {
    const id = el.dataset.lesson;
    store.setLessonDone(id, false, testMode());
    announce('Marked as not complete.');
    return `[data-action="lesson-complete"][data-lesson="${id}"]`;
  },
  /** Opens the card form with the question on the front and the good answer on the back (unverified, editable). */
  'lesson-card': (el) => {
    const lesson = store.lessonById(el.dataset.lesson);
    const i = Number(el.dataset.q);
    if (!lesson?.lookFor?.[i]) return null;
    flushLessonAnswers();
    startCardDraft({
      front: lesson.checkYourself[i],
      back: lesson.lookFor[i],
      week: lesson.week ?? null,
      topic: lesson.title.slice(0, 120),
      reference: (lesson.pathway ? `Pathway lesson ${lesson.order}: ${lesson.title}` : `Lesson, Day ${lesson.day}: ${lesson.title}`).slice(0, 300),
    });
    nav.focus = '#card-form-heading';
    location.hash = '#settings/content';
    return null;
  },
};

/** The day's lessons on Today (the main content of a study day), or nothing when there are none. */
export function todayLessonHtml(ctx) {
  if (ctx.kind !== 'study') return '';
  return store.lessonsForDay(ctx.contentDay).map((l) => lessonHtml(l, { level: 2 })).join('');
}

/** A "Lesson" link for each lesson on a day in the Week view. */
export function lessonLinkHtml(contentDay) {
  const lessons = store.lessonsForDay(contentDay);
  return lessons.map((l, i) => `<a class="button button--small" href="${lessonHref(l)}">${lessons.length > 1 ? `Lesson ${i + 1}` : 'Lesson'}<span class="visually-hidden">: ${esc(l.title)}</span></a>`).join('');
}

/** The page for one lesson (#lesson/3, or #lesson/3/2 for a day's second lesson). */
export function lessonPageView(section) {
  const [day, part = '1'] = String(section ?? '').split('/');
  // A day's later parts may since have been merged into its main lesson: show that one.
  const lesson = store.lessonForDay(Number(day), Number(part)) ?? store.lessonForDay(Number(day));
  if (!lesson) {
    return `
      <p><a href="#learn/lessons">← Lessons</a></p>
      <h1 id="day-heading" tabindex="-1">No lesson for this day</h1>
      <p>There is no ${Number(part) > 1 ? `lesson ${esc(part)} ` : 'lesson '}for day ${esc(day)} yet. Check for course updates in <a href="#settings/content">Settings → Content</a> to see if one has been added.</p>`;
  }
  return `
    <p><a href="#learn/lessons">← Lessons</a></p>
    ${lessonHtml(lesson, { level: 1 }).replace(`id="lesson-title-${esc(lesson.id)}"`, 'id="day-heading"')}`;
}

/** Clicking a resource in a lesson step opens the Library at that resource. */
export function handleLessonClick(e) {
  const link = e.target.closest?.('[data-resource-link]');
  if (!link) return false;
  showResourceInLibrary(link.dataset.resourceLink);
  announce('Opening the Library at that resource.');
  return true;
}

// ─── Pathways ────────────────────────────────────────────────────────────────

/** One row in a list of lessons, linking to the lesson page. */
export function lessonRowHtml(l, { mark, meta, upNext }) {
  const complete = isDone(l);
  return `
      <li class="step step--${complete ? 'done' : 'todo'} ${upNext ? 'step--next' : ''}">
        <a class="step__row" href="${lessonHref(l)}">
          <span class="step__mark" aria-hidden="true">${complete ? '✓' : esc(mark)}</span>
          <span class="step__body"><span class="step__title">${esc(l.title)}</span><span class="step__meta">${meta}${l.level ? ` · ${esc(LESSON_LEVEL_LABELS[l.level] ?? '')}` : ''} · about ${l.plannedMinutes} min${upNext ? ' · Up next' : ''}</span></span>
          <span class="visually-hidden"> (${complete ? 'complete' : upNext ? 'up next' : 'not started'})</span>
          <span class="step__go" aria-hidden="true">›</span>
        </a>
      </li>`;
}

/** Every lesson that belongs to a pathway: its own lessons, then the calendar days it shares. */
export function pathwayAllLessons(p) {
  const own = store.pathwayLessonsInOrder(p.id);
  const days = (p.coreDays ?? []).flatMap((d) => store.lessonsForDay(d));
  return { own, days, all: [...own, ...days] };
}

/** Security+ loads its own course files on demand, so it never depends on the optional content update and is always listed. */
const SECPLUS_COURSE = {
  id: 'secplus-801',
  title: 'Security+ for Product Designers — CompTIA SY0-801',
  summary: 'One 16-week pathway with two outcomes: readiness for Security+ V8 and the ability to apply security knowledge as a Senior Product Designer. Every official objective, labs and two timed mock exams, with design exercises inside the lessons where they truly apply. Independent of CompTIA.',
  forWho: 'Product designers preparing for Security+ SY0-801, including those with no IT background, with about 9 to 13 hours in most weeks. Questions are AI-written, so read the policy note on the pathway\'s first page.',
  order: 4,
  coreDays: [],
};

/** Taken off the list straight away, even for anyone who has not run the course update that removes it. Its days stay in the 60-day course. */
const RETIRED_PATHWAY = 'network-kubernetes';

/** Listed before its lessons are added. Selecting it adds them. */
const AI_COURSE = {
  id: 'ai-security',
  title: 'AI Security',
  summary: 'How AI products work and where security fits: prompt injection, data exposure, excessive agency, supply chain and monitoring, ending with a design exercise on agent permissions.',
  forWho: 'Designers working on products that connect AI to enterprise data.',
  order: 3,
  coreDays: [],
};

export function listedPathways() {
  const installed = store.pathwaysInOrder().filter((p) => p.id !== RETIRED_PATHWAY);
  const missing = [SECPLUS_COURSE, AI_COURSE].filter((b) => !installed.some((p) => p.id === b.id));
  return [...installed, ...missing];
}

/** The 60-day course, shown as a pathway. It is built in rather than a pack, so its lessons stay on the calendar and your progress is untouched. */
const CORE_COURSE = {
  id: CORE_ID,
  title: '60-Day Identity and Security Course',
  summary: 'The full calendar: a lesson for every study day, from security foundations through identity, networks, zero trust, sign-in, Kubernetes, incident response and governance, with hands-on exercises and two portfolio case studies.',
  forWho: 'Product designers moving into identity and network security, or anyone who wants a structured daily course.',
};

function coreStatusText() {
  const start = store.getSettings().courseStart;
  if (!start) return 'Not started';
  const day = planDayFor(today());
  return `Started ${formatShort(start)}${day ? ` · Day ${day} of 60` : ''}`;
}

// ─── Today, before anything is running ───────────────────────────────────────

/** What sets each course apart, for someone deciding. A pathway added later still appears, using its own description. */
const CHOICE_NOTES = {
  [CORE_COURSE.id]: { best: 'You want a daily plan for moving into identity and network security.', facts: '60 days · about 2 hours a study day' },
  'secplus-801': { best: 'You want the CompTIA certification, with design practice built in.', facts: '16 weeks · 9 to 13 hours in most weeks' },
  'ai-security': { best: 'You design products that connect AI to enterprise data.' },
};

function secplusStarted() {
  const c = store.getCert();
  return Object.keys(c.lessons).length > 0 || Object.keys(c.labs).length > 0 || Object.keys(c.q).length > 0 || Object.keys(c.pbq).length > 0
    || c.exams.length > 0 || Object.values(c.design ?? {}).some((e) => Object.keys(e).length > 0);
}

/** Every course, with what the chooser and the other pages need to know about it. */
export function courseChoices() {
  const settings = store.getSettings();
  const stateFor = (c) => ({ ...c, best: CHOICE_NOTES[c.id]?.best ?? c.forWho ?? '', facts: c.facts ?? CHOICE_NOTES[c.id]?.facts ?? '', state: pathwayState({ isActive: settings.activePathway === c.id, running: c.running, begun: c.started, done: c.done, total: c.total }) });
  const coreLessons = store.lessonsInOrder();
  const coreNext = nextLesson();
  const choices = [stateFor({
    id: CORE_ID, title: CORE_COURSE.title, href: `#path/${CORE_ID}`, full: true, done: coreLessons.filter(isDone).length, total: coreLessons.length,
    started: coreLessons.some(isDone), running: Boolean(settings.courseStart), needsInstall: !coreLessons.length,
    next: coreNext ? { id: coreNext.id, day: coreNext.day, title: coreNext.title, href: '#today' } : null,
  })];
  for (const p of listedPathways()) {
    const running = Boolean(settings.pathwayStarted?.[p.id]);
    if (p.id === SECPLUS_COURSE.id) {
      const sum = certPathwaySummary();
      const loaded = sum && !sum.failed;
      choices.push(stateFor({
        id: p.id, title: p.title, href: '#cert', full: true, done: loaded ? sum.done : Object.keys(store.getCert().lessons).length, total: loaded ? sum.total : 0,
        started: secplusStarted(), running, loading: !sum, loadFailed: Boolean(sum?.failed), weeks: loaded ? sum.weeks : null, design: loaded ? sum.design : null,
        next: loaded && sum.next ? { id: sum.next.id, title: sum.next.title, href: `#cert/lesson/${sum.next.id}`, meta: `Week ${sum.next.week} · Lesson ${sum.next.n} of ${sum.total} · about ${sum.next.min} min` } : null,
      }));
      continue;
    }
    const { all } = pathwayAllLessons(p);
    const pack = p === AI_COURSE;
    if (!all.length && !pack) continue;
    const minutes = all.reduce((n, l) => n + (l.plannedMinutes ?? 0), 0);
    const next = all.find((l) => !isDone(l)) ?? null;
    choices.push(stateFor({
      id: p.id, title: p.title, href: `#path/${esc(p.id)}`, full: false, done: all.filter(isDone).length, total: all.length, started: all.some(isDone), running, needsInstall: pack,
      facts: pack ? '6 lessons · about 11 hours' : `${plural(all.length, 'lesson', 'lessons')}${minutes ? ` · about ${Math.round(minutes / 60)} hours` : ''}`, forWho: p.forWho,
      next: next ? { id: next.id, title: next.title, href: lessonHref(next), meta: `Lesson ${next.order} of ${all.length} · about ${next.plannedMinutes} min` } : null,
    }));
  }
  return choices;
}

function progressLine(c) {
  if (c.id === CORE_COURSE.id) return `${c.done} of ${plural(c.total, 'lesson', 'lessons')} complete · calendar not running`;
  if (c.total) return `${c.done} of ${plural(c.total, 'lesson', 'lessons')} complete`;
  return c.done ? `${plural(c.done, 'lesson', 'lessons')} complete` : 'In progress';
}

/** Where someone is in Atlas: nothing installed, nothing begun, begun but no calendar, or on the 60-day calendar. */
export function journeyState() {
  const s = store.getSettings();
  if (s.courseStart || s.testDate.enabled) return 'running';
  return courseChoices().some((c) => c.started) ? 'started' : 'none';
}

/** Every course as a card you can select. Only one can be yours at a time. */
export function courseChooserHtml() {
  const choices = courseChoices();
  const full = choices.filter((c) => c.full);
  const focused = choices.filter((c) => !c.full);
  return `<h2 class="small-label">Full courses</h2>
    <ul class="course-list">${full.map(pathwayCardHtml).join('')}</ul>
    ${focused.length ? `<h2 class="small-label course-group">Short course</h2><ul class="course-list">${focused.map(pathwayCardHtml).join('')}</ul>` : ''}`;
}

export function startedCoursesHtml({ forProgress = false } = {}) {
  const started = courseChoices().filter((c) => c.started);
  return `<ul class="course-list">${started.map((c) => choiceHtml({ ...c, full: true }, {
    go: forProgress ? 'See progress' : 'Open',
    status: progressLine(c),
    href: forProgress && c.id === 'secplus-801' ? '#cert/progress' : c.href,
  })).join('')}</ul>`;
}

/** A page with nothing to show yet: what will appear here, and the one thing to do about it. */
export function startPromptHtml({ heading, text, points = [], visual = '', action }) {
  const act = action?.html ?? `<a class="button button--primary" href="${action?.href ?? '#today'}">${esc(action?.label ?? 'Choose a pathway')}</a>`;
  return `<section class="card start-prompt" aria-labelledby="start-heading">
    ${visual}
    <h2 id="start-heading">${esc(heading)}</h2>
    <p>${esc(text)}</p>
    ${points.length ? `<ul>${points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="button-row">${act}</div>
  </section>`;
}

/** Today when no calendar is running. Nothing here starts a course. */
export function chooseCourseHtml(dateText) {
  const begun = courseChoices().some((c) => c.state === 'paused');
  return `<section class="choose" aria-labelledby="day-heading"><p class="eyebrow">${esc(dateText)}</p>
    <h1 id="day-heading" tabindex="-1">${begun ? 'Choose what to work on' : 'Choose where to begin'}</h1>
    <p class="lesson-summary">Pick one pathway at a time. It shapes Today, Plan, Learn and Progress, and you can change it whenever you like.</p>
    ${courseChooserHtml()}
  </section>`;
}

function coreCourseView() {
  const all = store.lessonsInOrder();
  const next = nextLesson();
  const done = all.filter(isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const weeks = [...new Set(all.map((l) => l.week))];
  return `
    <p><a href="#learn/pathways">← Pathways</a></p>
    <h1 id="day-heading" tabindex="-1">${esc(CORE_COURSE.title)}</h1>
    <p class="lesson-summary">${esc(CORE_COURSE.summary)}</p>
    <p class="meta"><strong>For:</strong> ${esc(CORE_COURSE.forWho)}</p>
    ${pathwayControlHtml(CORE_COURSE.id)}
    ${all.length ? `
      <p class="meta"><strong>${esc(coreStatusText())}</strong> · ${done} of ${plural(all.length, 'lesson', 'lessons')} complete. See it by date in <a href="#plan">Plan</a>.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ${store.getSettings().courseStart ? `<button type="button" class="button--small" data-action="course-restart">Restart the calendar from today</button>
      <p class="meta">Restarting only moves the dates. Completed lessons and saved work stay as they are.</p>` : ''}
      ${weeks.map((w) => `
        <h2 class="small-label lessons-week">Week ${esc(w)}</h2>
        <ol class="steps-list lessons-list">${all.filter((l) => l.week === w).map((l) => lessonRowHtml(l, { mark: String(l.day), meta: `Day ${l.day}${(l.part ?? 1) > 1 ? ` · lesson ${l.part}` : ''}`, upNext: next?.id === l.id })).join('')}</ol>`).join('')}`
    : ''}`;
}

/** Learn → Pathways: every course you can choose, starting with the 60-day course. */
export function pathwaysListView() {
  return `
    <h1 id="day-heading" tabindex="-1">Pathways</h1>
    <p class="meta page-intro">Work on one pathway at a time. Each keeps its own progress, so you can switch whenever you like.</p>
    ${courseChooserHtml()}`;
}

function pathwayView(p) {
  const { own, days, all } = pathwayAllLessons(p);
  const next = all.find((l) => !isDone(l)) ?? null;
  const done = all.filter(isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  return `
    <p><a href="#learn/pathways">← Pathways</a></p>
    <h1 id="day-heading" tabindex="-1">${esc(p.title)}</h1>
    <p class="lesson-summary">${esc(p.summary)}</p>
    <p class="meta"><strong>For:</strong> ${esc(p.forWho)}</p>
    ${pathwayControlHtml(p.id)}
    ${all.length ? `
      <p class="meta"><strong>${done} of ${plural(all.length, 'lesson', 'lessons')}</strong> complete.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ` : ''}
    ${own.length ? `
      <h2 class="small-label lessons-week">Pathway lessons</h2>
      <ol class="steps-list lessons-list">${own.map((l) => lessonRowHtml(l, { mark: String(l.order), meta: `Lesson ${l.order}`, upNext: next?.id === l.id })).join('')}</ol>` : ''}
    ${days.length ? `
      <h2 class="small-label lessons-week">In the 60-day calendar</h2>
      <p class="meta">These calendar days belong to this pathway. If this pathway is not your focus, you can switch their items to Optional in <a href="#settings/content">Settings → Content</a>.</p>
      <ol class="steps-list lessons-list">${days.map((l) => lessonRowHtml(l, { mark: String(l.day), meta: `Day ${l.day}`, upNext: next?.id === l.id })).join('')}</ol>` : ''}`;
}

/** #path/<id> (a pathway) or #path/<id>/<n> (its lesson n). */
export function pathwayRouteView(section) {
  const [id, n] = String(section ?? '').split('/');
  if (id === CORE_COURSE.id) return coreCourseView();
  if (id === RETIRED_PATHWAY) {
    return `
      <p><a href="#learn/pathways">← Pathways</a></p>
      <h1 id="day-heading" tabindex="-1">This pathway is now part of the 60-day course</h1>
      <p>Network and Kubernetes Security was Week 5 and the case study 2 days of the ${esc(CORE_COURSE.title)}. Those lessons are still there, and anything you finished is still marked complete.</p>
      <div class="button-row"><a class="button button--primary" href="#path/${CORE_COURSE.id}">Open the 60-day course</a></div>`;
  }
  const p = store.pathwayById(id) ?? listedPathways().find((x) => x.id === id);
  if (!p) {
    return `
      <p><a href="#learn/pathways">← Pathways</a></p>
      <h1 id="day-heading" tabindex="-1">No such pathway</h1>
      <p>This pathway is not in your course yet. Check for course updates in <a href="#settings/content">Settings → Content</a>.</p>`;
  }
  if (p.id === 'secplus-801' && n === undefined) {
    return `
      <p><a href="#learn/pathways">← Pathways</a></p>
      <h1 id="day-heading" tabindex="-1">${esc(p.title)}</h1>
      <p>${esc(p.summary)}</p>
      <a class="button button--primary" href="#cert">Open the pathway</a>`;
  }
  if (n === undefined) return pathwayView(p);
  const lesson = store.pathwayLessonsInOrder(p.id).find((l) => l.order === Number(n));
  if (!lesson) {
    return `
      <p><a href="#path/${esc(p.id)}">← ${esc(p.title)}</a></p>
      <h1 id="day-heading" tabindex="-1">No lesson ${esc(n)} in this pathway</h1>
      <p>Check for course updates in <a href="#settings/content">Settings → Content</a>.</p>`;
  }
  return `
    <p><a href="#path/${esc(p.id)}">← ${esc(p.title)}</a></p>
    ${lessonHtml(lesson, { level: 1 }).replace(`id="lesson-title-${esc(lesson.id)}"`, 'id="day-heading"')}`;
}
