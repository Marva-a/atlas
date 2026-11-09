// Notes on lesson text: select words in a lesson, write a note such as "Review again", and the words
// stay highlighted. Learn → Notes lists every note with a way back to its sentence.
//
// A lesson marks its text with data-note-scope (which lesson), data-note-title and data-note-href
// (where its page is). Notes are saved with your other data, so backups and exports include them.
import * as store from './store.js';
import { esc, announce } from './ui.js';
import { trimSelection, makeAnchor, findAnchor, cardFromSelection } from './note-anchor.js';

const SKIP = 'button, textarea, input, select, label, summary, [data-note-skip], .note-pop';
const QUICK = ['Review again', 'Not sure I understand this', 'Important for the exam'];

let rerender = () => {};
let pop = null; // the one floating box: the Add note button, the note form or a saved note
let pending = null; // { scope, start, end } while you are adding a note
let goTo = null; // { id, tries } a note to scroll to once its lesson is on screen

// ─── The text of a lesson, as one string with a map back to the page ─────────

/** Every text node in a lesson, with where it starts in the lesson's text. Spaces between blocks count as one space. */
function textMap(scopeEl) {
  const nodes = [];
  let text = '';
  const walker = document.createTreeWalker(scopeEl, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const blank = !/\S/.test(n.data);
    const piece = blank ? ' ' : n.data;
    nodes.push({ node: n, start: text.length, length: piece.length, blank });
    text += piece;
  }
  return { text, nodes };
}

/** Where a selection starts and ends in the lesson's text. */
function offsetsOf(map, range) {
  const at = (container, offset, edge) => {
    const hit = map.nodes.find((m) => m.node === container);
    if (hit) return hit.start + Math.min(offset, hit.length);
    // The selection edge is on an element: use the nearest text inside the selection.
    if (edge === 'start') {
      const m = map.nodes.find((x) => range.comparePoint(x.node, x.node.length) !== -1);
      return m ? m.start : map.text.length;
    }
    const m = [...map.nodes].reverse().find((x) => range.comparePoint(x.node, 0) !== 1);
    return m ? m.start + m.length : 0;
  };
  return { start: at(range.startContainer, range.startOffset, 'start'), end: at(range.endContainer, range.endOffset, 'end') };
}

/** Wraps the text between start and end in highlight marks (one per text node it touches). */
function highlight(scopeEl, start, end, note) {
  const { nodes } = textMap(scopeEl);
  for (const m of nodes) {
    if (m.blank || m.start >= end || m.start + m.length <= start) continue;
    let node = m.node;
    const from = Math.max(0, start - m.start);
    const to = Math.min(m.length, end - m.start);
    if (to < node.length) node.splitText(to);
    if (from > 0) node = node.splitText(from);
    const mark = document.createElement('mark');
    mark.className = 'note-mark';
    mark.dataset.note = note.id;
    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    mark.setAttribute('aria-label', `Your note: ${note.comment || 'no text'}. Press Enter to open it.`);
    node.replaceWith(mark);
    mark.append(node);
  }
}

// ─── After each render: show the notes on any lesson that is on screen ───────

export function applyNotes(root) {
  closePop();
  const notes = store.getLessonNotes();
  for (const scopeEl of root.querySelectorAll('[data-note-scope]')) {
    const mine = notes.filter((n) => n.scope === scopeEl.dataset.noteScope);
    if (!mine.length) continue;
    const { text } = textMap(scopeEl);
    // Find every note first, then mark them, so marking one never shifts another.
    const found = mine.map((n) => ({ n, at: findAnchor(text, n) })).filter((x) => x.at);
    for (const { n, at } of found) highlight(scopeEl, at.start, at.end, n);
  }
  if (goTo) {
    const mark = root.querySelector(`.note-mark[data-note="${CSS.escape(goTo.id)}"]`);
    if (mark) {
      goTo = null;
      requestAnimationFrame(() => {
        mark.scrollIntoView({ block: 'center' });
        mark.focus({ preventScroll: true });
        root.querySelectorAll(`.note-mark[data-note="${CSS.escape(mark.dataset.note)}"]`).forEach((m) => m.classList.add('note-mark--flash'));
      });
    } else if (++goTo.tries > 4) goTo = null; // the lesson may still be loading: try a few renders, then stop
  }
}

// ─── The floating box ────────────────────────────────────────────────────────

function closePop() {
  pop?.remove();
  pop = null;
}

/** Places the box just below a rectangle on the page, kept inside the window. */
function place(el, rect, { atEnd = false } = {}) {
  document.body.append(el);
  const width = el.offsetWidth;
  const left = Math.max(8, Math.min((atEnd ? rect.right - width : rect.left) + window.scrollX, window.scrollX + document.documentElement.clientWidth - width - 8));
  el.style.left = `${left}px`;
  el.style.top = `${rect.bottom + window.scrollY + 8}px`;
  if (el.getBoundingClientRect().bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
}

function showAddButton(rect) {
  closePop();
  pop = document.createElement('div');
  pop.className = 'note-pop note-pop--add';
  pop.innerHTML = `<div class="note-pop__pair"><button type="button" class="button button--small button--primary" data-note-do="add" title="Add a note on these words (Alt+N)">Add note</button><button type="button" class="button button--small button--primary" data-note-do="card" title="Make a flashcard from these words">Make flashcard</button></div>`;
  place(pop, rect, { atEnd: true });
}

function showForm({ quote, comment = '', id = null }, rect) {
  closePop();
  pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', id ? 'Edit note' : 'Add a note');
  pop.innerHTML = `
    <p class="note-pop__quote">“${esc(quote.length > 140 ? `${quote.slice(0, 140)}…` : quote)}”</p>
    <label class="note-pop__label" for="note-text">${id ? 'Edit your note' : 'Your note'}</label>
    <textarea id="note-text" rows="3" maxlength="2000" placeholder="For example: review again">${esc(comment)}</textarea>
    <div class="note-pop__chips">${QUICK.map((q) => `<button type="button" class="chip-button" data-note-do="quick">${esc(q)}</button>`).join('')}</div>
    <div class="note-pop__actions">
      <button type="button" class="button button--small button--primary" data-note-do="save" ${id ? `data-id="${esc(id)}"` : ''}>Save note</button>
      ${id ? '' : '<button type="button" class="link-button" data-note-do="card">Make a flashcard instead</button>'}
      <button type="button" class="link-button" data-note-do="close">Cancel</button>
    </div>`;
  place(pop, rect);
  pop.querySelector('textarea').focus();
}

const HOW = {
  term: 'Made from the key term and its meaning.',
  definition: 'The question asks what your selection describes. Edit either side if you like.',
  blank: 'One word is blanked out for you to recall. Edit either side if you like.',
  open: 'Write the question you want to be asked. The answer is your selection.',
};

function showCardForm(rect) {
  closePop();
  const card = cardFromSelection(pending.anchor.quote, { defined: pending.defined, terms: pending.terms, title: pending.title });
  pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Make a flashcard');
  pop.innerHTML = `
    <p class="note-pop__label">Make a flashcard</p>
    <label class="note-pop__label note-pop__label--side" for="card-front">Question</label>
    <textarea id="card-front" rows="2" maxlength="2000">${esc(card.front)}</textarea>
    <label class="note-pop__label note-pop__label--side" for="card-back">Answer</label>
    <textarea id="card-back" rows="3" maxlength="2000">${esc(card.back)}</textarea>
    <p class="meta note-pop__hint">${esc(HOW[card.how])}</p>
    <p class="note-pop__error" role="alert" hidden></p>
    <div class="note-pop__actions">
      <button type="button" class="button button--small button--primary" data-note-do="card-save">Save flashcard</button>
      <button type="button" class="link-button" data-note-do="close">Cancel</button>
    </div>`;
  place(pop, rect);
  pop.querySelector('#card-front').focus();
}

function saveCard() {
  const front = pop.querySelector('#card-front').value.trim();
  const back = pop.querySelector('#card-back').value.trim();
  const error = pop.querySelector('.note-pop__error');
  const fail = (text) => { error.textContent = text; error.hidden = false; };
  if (!front || !back) return fail('Add both a question and an answer.');
  if (store.getData().cards.some((c) => !c.retired && c.front.trim().toLowerCase() === front.toLowerCase())) return fail('You already have a flashcard with this question.');
  const week = Number(pending.week);
  const r = store.addCard({ type: 'recall', front, back, week: Number.isInteger(week) && week >= 1 && week <= 9 ? week : null, topic: pending.title.slice(0, 120), reference: pending.ref, verified: false });
  if (!r.ok) return fail(r.problems.join(' '));
  const rect = pending.rect;
  pending = null;
  window.getSelection()?.removeAllRanges();
  rerender();
  announce('Flashcard added. Review it in Learn, Flashcards.');
  pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.setAttribute('role', 'status');
  pop.innerHTML = '<p class="note-pop__done">✓ Flashcard added</p><div class="note-pop__actions"><a href="#learn/cards">Review flashcards</a><button type="button" class="link-button" data-note-do="close">Close</button></div>';
  place(pop, rect);
  const shown = pop;
  setTimeout(() => { if (pop === shown) closePop(); }, 5000);
  return undefined;
}

function showNote(note, rect) {
  closePop();
  pop = document.createElement('div');
  pop.className = 'note-pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Your note');
  pop.innerHTML = `
    <p class="note-pop__comment">${note.comment ? esc(note.comment) : '<span class="meta">No text, just a highlight.</span>'}</p>
    <p class="meta">${esc(new Date(note.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}</p>
    <div class="note-pop__actions">
      <button type="button" class="button button--small" data-note-do="edit" data-id="${esc(note.id)}">Edit</button>
      <button type="button" class="button button--small button--danger" data-note-do="remove" data-id="${esc(note.id)}">Remove note</button>
      <button type="button" class="link-button" data-note-do="close">Close</button>
    </div>`;
  place(pop, rect);
  pop.querySelector('button').focus();
}

// ─── Selecting text ──────────────────────────────────────────────────────────

/** The current selection, if it sits inside one lesson. */
function selectionInLesson() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const el = (n) => (n.nodeType === 1 ? n : n.parentElement);
  const scopeEl = el(range.commonAncestorContainer)?.closest('[data-note-scope]');
  if (!scopeEl || el(range.startContainer)?.closest(SKIP) || el(range.endContainer)?.closest(SKIP)) return null;
  const map = textMap(scopeEl);
  const { start, end } = offsetsOf(map, range);
  const trimmed = trimSelection(map.text, start, end);
  if (!trimmed) return null;
  const rects = range.getClientRects();
  // Inside a key term's definition: the card is the term and its meaning.
  const pair = el(range.commonAncestorContainer)?.closest('dl.words > div');
  const defined = pair ? { term: pair.querySelector('dt')?.textContent ?? '', meaning: pair.querySelector('dd')?.textContent ?? '' } : null;
  return { scopeEl, ...trimmed, defined, rect: rects[rects.length - 1] ?? range.getBoundingClientRect(), text: map.text };
}

function offerFromSelection() {
  const s = selectionInLesson();
  if (!s) {
    if (pop?.classList.contains('note-pop--add')) closePop();
    pending = null;
    return;
  }
  const d = s.scopeEl.dataset;
  pending = {
    scope: d.noteScope, title: d.noteTitle, href: d.noteHref, ref: d.cardRef ?? d.noteTitle, week: d.cardWeek ?? '',
    anchor: makeAnchor(s.text, s.start, s.end), rect: s.rect, defined: s.defined, terms: [...s.scopeEl.querySelectorAll('dl.words dt')].map((dt) => dt.textContent.trim()),
  };
  showAddButton(s.rect);
}

function openForm() {
  if (!pending) return;
  showForm({ quote: pending.anchor.quote }, pending.rect);
}

function save(button) {
  const comment = pop.querySelector('textarea').value;
  if (button.dataset.id) {
    store.updateLessonNote(button.dataset.id, comment);
    announce('Note saved.');
  } else if (pending) {
    const note = store.addLessonNote({ ...pending, comment });
    pending = null;
    window.getSelection()?.removeAllRanges();
    announce(note ? 'Note added. Find all your notes in Learn, Notes.' : 'That note could not be saved.');
  }
  closePop();
  rerender();
}

/** Wires up selecting, the floating box and the highlights. Called once at startup. */
export function startNotes(mainEl, onChange) {
  rerender = onChange;
  let timer = null;
  const later = () => { clearTimeout(timer); timer = setTimeout(offerFromSelection, 200); };
  mainEl.addEventListener('mouseup', later);
  mainEl.addEventListener('touchend', later);
  document.addEventListener('keyup', (e) => { if (e.shiftKey || e.key.startsWith('Arrow')) later(); });

  document.addEventListener('mousedown', (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest('.note-mark')) closePop();
  });
  // The Add note button must not clear the selection it is about.
  document.addEventListener('mousedown', (e) => { if (e.target.closest('.note-pop--add [data-note-do]')) e.preventDefault(); }, true);

  document.addEventListener('click', (e) => {
    const act = e.target.closest('[data-note-do]');
    if (act) {
      const id = act.dataset.id;
      switch (act.dataset.noteDo) {
        case 'add': openForm(); break;
        case 'card': if (pending) showCardForm(pending.rect); break;
        case 'card-save': saveCard(); break;
        case 'quick': { const t = pop.querySelector('textarea'); t.value = act.textContent; t.focus(); break; }
        case 'save': save(act); break;
        case 'edit': { const n = store.getLessonNote(id); if (n) showForm(n, pop.getBoundingClientRect()); break; }
        case 'remove': store.deleteLessonNote(id); closePop(); announce('Note removed.'); rerender(); break;
        default: closePop();
      }
      return;
    }
    const mark = e.target.closest('.note-mark');
    if (mark && window.getSelection()?.isCollapsed) {
      const n = store.getLessonNote(mark.dataset.note);
      if (n) showNote(n, mark.getBoundingClientRect());
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pop) { const back = document.querySelector(`.note-mark[data-note="${CSS.escape(pop.querySelector('[data-id]')?.dataset.id ?? '')}"]`); closePop(); back?.focus(); return; }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pop?.querySelector('textarea')) {
      e.preventDefault();
      if (pop.querySelector('[data-note-do="card-save"]')) saveCard(); else save(pop.querySelector('[data-note-do="save"]'));
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('note-mark')) {
      e.preventDefault();
      const n = store.getLessonNote(e.target.dataset.note);
      if (n) showNote(n, e.target.getBoundingClientRect());
      return;
    }
    // Alt+N adds a note on the selected words, for people selecting with the keyboard.
    if (e.altKey && e.code === 'KeyN') {
      const s = selectionInLesson();
      if (!s) return;
      e.preventDefault();
      offerFromSelection();
      openForm();
    }
  });
  window.addEventListener('hashchange', closePop);
}

// ─── Learn → Notes ───────────────────────────────────────────────────────────

const dateText = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export function notesPageHtml() {
  const notes = store.getLessonNotes();
  const intro = `<h1 id="day-heading" tabindex="-1">Notes</h1>
    <p>Select any words in a lesson and choose <strong>Add note</strong>. The words stay highlighted, and every note is listed here.</p>`;
  if (!notes.length) {
    return `${intro}<div class="card"><h2>No notes yet</h2><p>Open a lesson, select a sentence you want to come back to, and add a note such as “Review again”. On a keyboard, select with Shift and the arrow keys, then press Alt+N.</p><p><a class="button" href="#learn/lessons">Go to lessons</a></p></div>`;
  }
  const groups = new Map();
  for (const n of notes) {
    if (!groups.has(n.scope)) groups.set(n.scope, []);
    groups.get(n.scope).push(n);
  }
  const items = [...groups.values()].map((list) => `
    <section class="card note-group">
      <h2><a href="${esc(list[0].href)}">${esc(list[0].title)}</a></h2>
      <ul class="note-list">${list.map((n) => `
        <li class="note-item" id="note-${esc(n.id)}">
          <blockquote class="note-item__quote"><mark>${esc(n.quote.length > 400 ? `${n.quote.slice(0, 400)}…` : n.quote)}</mark></blockquote>
          ${n.comment ? `<p class="note-item__comment">${esc(n.comment)}</p>` : ''}
          <p class="note-item__foot"><span class="meta">${esc(dateText(n.createdAt))}</span>
            <button type="button" class="button button--small" data-action="note-go" data-id="${esc(n.id)}">Go to sentence</button>
            <button type="button" class="link-button" data-action="note-remove" data-id="${esc(n.id)}">Remove</button></p>
        </li>`).join('')}</ul>
    </section>`).join('');
  return `${intro}<p class="meta">${notes.length} ${notes.length === 1 ? 'note' : 'notes'} in ${groups.size} ${groups.size === 1 ? 'lesson' : 'lessons'}, newest first.</p>${items}`;
}

export const noteActions = {
  'note-go': (el) => {
    const n = store.getLessonNote(el.dataset.id);
    if (!n) return null;
    goTo = { id: n.id, tries: 0 };
    if (location.hash === n.href) return null; // already there: the render that follows scrolls to it
    location.hash = n.href;
    return null;
  },
  'note-remove': (el) => {
    store.deleteLessonNote(el.dataset.id);
    announce('Note removed.');
    return '#day-heading';
  },
};
