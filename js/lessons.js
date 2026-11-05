// Daily lessons: plain-language context for a study day, from a lessons pack.
// A lesson has a summary, why it matters, key ideas, words, timed steps (each can point at a resource in
// the Library), what to skim or skip, and check-yourself questions with a box that saves your answer.
// Lessons are content: you cannot edit them, and your answers are stored apart so an update never loses them.
import * as store from './store.js';
import { esc, announce, testMode, nav, plural } from './ui.js';
import { formatShort } from './dates.js';
import { nextLessonOf } from './progress.js';
import { showResourceInLibrary } from './resources.js';
import { startCardDraft } from './flashcards.js';
import { LESSON_LEVEL_LABELS } from './content.js';

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
    <section class="card lesson" aria-labelledby="lesson-title-${esc(lesson.id)}">
      <p class="eyebrow">${lessonPlaceText(lesson)}${lesson.level ? ` · ${esc(LESSON_LEVEL_LABELS[lesson.level] ?? '')}` : ''} · about ${esc(minutesText(lesson.plannedMinutes))}</p>
      <${h} id="lesson-title-${esc(lesson.id)}" tabindex="-1">${esc(lesson.title)}</${h}>
      <p class="lesson-summary">${esc(lesson.inOneSentence)}</p>
      <p class="lesson-objective"><strong>By the end, you can:</strong> ${esc(lesson.youCanNow)}</p>

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

/** Learn → Lessons: the course as a list, with what is complete and what is up next. */
export function lessonsListView() {
  const all = store.lessonsInOrder();
  const next = nextLesson();
  const done = all.filter(isDone).length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const weeks = [...new Set(all.map((l) => l.week))];
  const rows = weeks.map((w) => `
    <h2 class="small-label lessons-week">Week ${w}</h2>
    <ol class="steps-list lessons-list">
      ${all.filter((l) => l.week === w).map((l) => {
    const complete = isDone(l);
    const upNext = next && next.id === l.id;
    const state = complete ? 'done' : upNext ? 'next' : 'todo';
    const said = complete ? 'complete' : upNext ? 'up next' : 'not started';
    return `
      <li class="step step--${state === 'done' ? 'done' : 'todo'} ${upNext ? 'step--next' : ''}">
        <a class="step__row" href="${lessonHref(l)}">
          <span class="step__mark" aria-hidden="true">${complete ? '✓' : l.day}</span>
          <span class="step__body"><span class="step__title">${esc(l.title)}</span><span class="step__meta">Day ${l.day}${(l.part ?? 1) > 1 ? ` · lesson ${l.part}` : ''}${l.level ? ` · ${esc(LESSON_LEVEL_LABELS[l.level] ?? '')}` : ''} · about ${l.plannedMinutes} min${upNext ? ' · Up next' : ''}</span></span>
          <span class="visually-hidden"> (${said})</span>
          <span class="step__go" aria-hidden="true">›</span>
        </a>
      </li>`;
  }).join('')}
    </ol>`).join('');
  return `
    <h1 id="day-heading" tabindex="-1">Lessons</h1>
    ${all.length ? `
      <p class="meta page-intro"><strong>${done} of ${plural(all.length, 'lesson', 'lessons')}</strong> complete. Go at your own pace: finish one, then start the next.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ${next ? `<div class="button-row"><a class="button button--primary" href="${lessonHref(next)}">${done ? 'Continue' : 'Start'}: ${esc(next.title)}</a></div>` : '<p class="status-ok">Every lesson written so far is complete.</p>'}
      ${rows}
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
function lessonRowHtml(l, { mark, meta, upNext }) {
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
function pathwayAllLessons(p) {
  const own = store.pathwayLessonsInOrder(p.id);
  const days = (p.coreDays ?? []).flatMap((d) => store.lessonsForDay(d));
  return { own, days, all: [...own, ...days] };
}

/** Learn → Pathways: the self-paced tracks you can add to the 60-day course. */
export function pathwaysListView() {
  const pathways = store.pathwaysInOrder();
  const cards = pathways.map((p) => {
    const { all } = pathwayAllLessons(p);
    const done = all.filter(isDone).length;
    return `
      <li class="card pathway-card">
        <h2><a href="#path/${esc(p.id)}">${esc(p.title)}</a></h2>
        <p>${esc(p.summary)}</p>
        <p class="meta"><strong>For:</strong> ${esc(p.forWho)}</p>
        <p class="meta">${done} of ${plural(all.length, 'lesson', 'lessons')} complete</p>
      </li>`;
  }).join('');
  return `
    <h1 id="day-heading" tabindex="-1">Pathways</h1>
    <p class="meta page-intro">The 60-day calendar is the core: security foundations, identity, access, zero trust, sign-in and governance. Pathways are focused tracks beside it, to go deeper in one area alongside the calendar or after it.</p>
    ${pathways.length
    ? `<ul class="pathway-list">${cards}</ul>`
    : '<p class="empty-state">No pathways yet. Check for course updates in <a href="#settings/content">Settings → Content</a>.</p>'}`;
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
    ${all.length ? `
      <p class="meta"><strong>${done} of ${plural(all.length, 'lesson', 'lessons')}</strong> complete.</p>
      <div class="progress" role="img" aria-label="${done} of ${all.length} lessons complete"><span style="width:${pct}%"></span></div>
      ${next ? `<div class="button-row"><a class="button button--primary" href="${lessonHref(next)}">${done ? 'Continue' : 'Start'}: ${esc(next.title)}</a></div>` : '<p class="status-ok">Every lesson in this pathway is complete.</p>'}` : ''}
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
  const p = store.pathwayById(id);
  if (!p) {
    return `
      <p><a href="#learn/pathways">← Pathways</a></p>
      <h1 id="day-heading" tabindex="-1">No such pathway</h1>
      <p>This pathway is not in your course yet. Check for course updates in <a href="#settings/content">Settings → Content</a>.</p>`;
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
