// Finding the exact words a note was written on, even after a lesson's text moves a little.
// Pure functions over plain strings, so the checks can run them in Node.
//
// A note remembers the words you selected (quote), a little of what came before and after them
// (prefix, suffix) and roughly where they were (pos). To find them again, every place the quote
// appears is scored by how well its surroundings still match, and the closest best match wins.

const CONTEXT = 40; // characters of surrounding text kept on each side
export const QUOTE_MIN = 2;
export const QUOTE_MAX = 1200;

const WORD = /[\p{L}\p{N}'’-]/u;

/** Trims spaces off both ends of a selection and widens it to whole words. Returns null if nothing usable is left. */
export function trimSelection(text, start, end) {
  let s = Math.max(0, Math.min(start, end));
  let e = Math.min(text.length, Math.max(start, end));
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  if (s < e) {
    while (s > 0 && WORD.test(text[s - 1]) && WORD.test(text[s])) s -= 1;
    while (e < text.length && WORD.test(text[e]) && WORD.test(text[e - 1])) e += 1;
  }
  if (e - s < QUOTE_MIN || e - s > QUOTE_MAX) return null;
  return { start: s, end: e };
}

/** What a note stores so it can find its words again. */
export function makeAnchor(text, start, end) {
  return {
    quote: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT), start),
    suffix: text.slice(end, end + CONTEXT),
    pos: start,
  };
}

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ');

/** How many characters two strings share, counting from their ends (fromEnd) or their starts. */
function shared(a, b, fromEnd) {
  const x = squash(a);
  const y = squash(b);
  let n = 0;
  while (n < x.length && n < y.length && (fromEnd ? x[x.length - 1 - n] === y[y.length - 1 - n] : x[n] === y[n])) n += 1;
  return n;
}

/** Where the note's words are in `text` now, or null if they are gone. */
export function findAnchor(text, anchor) {
  const quote = anchor?.quote;
  if (!quote) return null;
  let best = null;
  for (let at = text.indexOf(quote); at !== -1; at = text.indexOf(quote, at + 1)) {
    const score = shared(text.slice(Math.max(0, at - CONTEXT), at), anchor.prefix, true)
      + shared(text.slice(at + quote.length, at + quote.length + CONTEXT), anchor.suffix, false);
    const distance = Math.abs(at - (anchor.pos ?? 0));
    if (!best || score > best.score || (score === best.score && distance < best.distance)) best = { start: at, end: at + quote.length, score, distance };
  }
  return best && { start: best.start, end: best.end };
}

// ─── Turning selected words into a flashcard ─────────────────────────────────

const PRONOUNS = new Set(['it', 'this', 'that', 'they', 'these', 'those', 'there', 'which', 'who', 'he', 'she', 'we', 'you', 'i', 'each', 'both', 'one', 'what', 'here']);
const PASSIVE = new Set(['not', 'also', 'often', 'usually', 'only', 'still', 'being', 'able', 'more', 'less', 'very', 'so', 'too', 'now', 'always', 'never', 'sometimes', 'already', 'just', 'made', 'kept', 'held', 'sent', 'built', 'run', 'set', 'put', 'lost', 'left', 'found', 'known', 'shown', 'given', 'taken', 'seen', 'done']);
const COMMON = new Set(['something', 'nothing', 'anything', 'everything', 'because', 'which', 'their', 'there', 'these', 'those', 'would', 'could', 'should', 'about', 'other', 'every', 'without', 'through', 'where', 'while', 'when', 'after', 'before', 'between', 'another', 'people', 'person', 'someone', 'anyone', 'everyone', 'really', 'always', 'never', 'often', 'usually', 'example', 'things', 'thing', 'still', 'being', 'having', 'doing', 'makes', 'make', 'within', 'around', 'against', 'under', 'until', 'whether', 'cannot', 'might', 'first', 'second', 'third', 'again', 'during', 'since', 'though', 'although', 'instead', 'enough', 'little', 'means']);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (term) => new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRe(term)})(?=$|[^\\p{L}\\p{N}])`, 'giu');
/** Lowercases a leading word unless it is an acronym or a name written in capitals (TLS, IPv4, OAuth). */
const soften = (s) => (/^[A-Z][a-z]+(\s|$)/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const tidy = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** The sentence with a word blanked out; the answer gives the word as the sentence writes it, then the sentence. */
function blankCard(text, word) {
  const said = wordRe(word).exec(text)?.[2] ?? word;
  return { front: `Fill in the blank: ${text.replace(wordRe(word), (_, before) => `${before}_____`)}`, back: `${said} — ${text}`, how: 'blank' };
}

/**
 * A question and answer for the words you selected, in the style of the lessons' own cards.
 * `defined` is { term, meaning } when the selection is inside a key-term definition; `terms` are the
 * lesson's key terms; `title` is the lesson's title. Returns { front, back, how }.
 *   how: 'term' (a key term and its meaning), 'definition' (a sentence that says what something is),
 *        'blank' (a key term blanked out of the sentence) or 'open' (a question to make your own).
 */
export function cardFromSelection(quote, { defined = null, terms = [], title = '' } = {}) {
  const text = tidy(quote);
  if (defined?.term && defined?.meaning) return { front: `What does “${tidy(defined.term)}” mean?`, back: tidy(defined.meaning), how: 'term' };

  // "Encryption is a lockbox: …" asks "What is encryption?"
  const m = /^(?:(an?|the)\s+)?([^,:;.()?!]{1,48}?)\s+(is|are|means)\s+(.{3,})/i.exec(text);
  if (m) {
    const words = m[2].trim().split(/\s+/);
    const next = m[4].split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
    const describes = !/(ed|en)$/.test(next) && !PASSIVE.has(next); // "are stored as…" says what happens to it, not what it is
    if (describes && words.length <= 5 && !PRONOUNS.has(words[0].toLowerCase()) && !/^(if|when|because|so|but|and|or|in|on|at|for|with|to|from|as)$/i.test(words[0])) {
      const subject = m[1] ? `${m[1].toLowerCase()} ${m[2].trim()}` : soften(m[2].trim());
      const verb = m[3].toLowerCase();
      const front = verb === 'means' ? `What does ${subject} mean?` : `What ${verb} ${subject}?`;
      return { front: front[0].toUpperCase() + front.slice(1), back: text, how: 'definition' };
    }
  }

  // A key term in the sentence becomes the blank to fill in.
  const term = [...terms].filter(Boolean).sort((a, b) => b.length - a.length).find((t) => wordRe(t).test(text));
  if (term) {
    return blankCard(text, term);
  }

  // Otherwise the longest meaningful word becomes the blank.
  const key = (text.match(/[\p{L}][\p{L}\p{N}'’-]{4,}/gu) ?? []).filter((w) => !COMMON.has(w.toLowerCase())).sort((a, b) => b.length - a.length)[0];
  if (key && text.split(/\s+/).length >= 4) {
    return blankCard(text, key);
  }

  const start = text.split(/\s+/).slice(0, 6).join(' ').replace(/[.,;:!?…]+$/, '');
  return { front: `${title ? `In “${tidy(title)}”, w` : 'W'}hat does this explain: “${start}…”?`, back: text, how: 'open' };
}
