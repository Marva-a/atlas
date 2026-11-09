// Lesson visuals, the pure part: turns one visual into HTML and checks it. No page or storage, so tests and the content check can use it.
// Small diagrams made of real text, so they stay sharp, reflow on a phone, follow the theme and can be read aloud.
//
// They live in content/visuals.json, keyed by lesson id, and load on their own, so they never touch your saved data.
// A lesson works in full without them: every visual restates something the lesson's text already teaches.
//
// A visual is { k: kind, t: title, n: optional note, ...parts }. Kinds:
//   flow   s: steps in order. A step is "Label", ["Label", "detail", tone] or { l, d, tone, via, dash }
//   cycle  s: steps, then it repeats. b: optional text for the return arrow
//   layers s: outermost first
//   hub    c: the centre, s: what surrounds it
//   scale  from, to: the two ends, s: the stops between them, in order
//   compare cols: [{ h: heading, tone, items: [] }]
//   matrix x: column headings, y: row headings, c: rows of cells. A cell is "text" or ["text", tone]

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const TONES = new Set(['good', 'bad', 'warn', 'plain']);
const KINDS = new Set(['flow', 'cycle', 'layers', 'hub', 'scale', 'compare', 'matrix']);
const ROW_LIMIT = 4; // more steps than this read better top to bottom

const norm = (x) => (typeof x === 'string' ? { l: x } : Array.isArray(x) ? { l: x[0], d: x[1], tone: x[2] } : x);
const toneClass = (t) => (TONES.has(t) ? ` vz-tone--${t}` : '');
const nodeHtml = ({ l, d, tone: t }, tag = 'div') => `<${tag} class="vz-node${toneClass(t)}"><strong>${esc(l)}</strong>${d ? `<span>${esc(d)}</span>` : ''}</${tag}>`;

function flowHtml(v, cycle) {
  const steps = v.s.map(norm);
  const column = steps.length > ROW_LIMIT || steps.some((s) => s.via);
  const items = steps.map((s) => `<li class="vz-step">${s.via ? `<span class="vz-via${s.dash ? ' vz-via--dash' : ''}">${esc(s.via)}</span>` : ''}${nodeHtml(s)}</li>`).join('');
  return `<ol class="vz-flow ${column ? 'vz-flow--col' : 'vz-flow--row'}" style="--n:${steps.length}">${items}</ol>
    ${cycle ? `<p class="vz-loop"><span aria-hidden="true">↺</span> ${esc(v.b ?? 'Then back to the start')}</p>` : ''}`;
}

const layersHtml = (v) => `<ol class="vz-layers">${v.s.map(norm).map((s, i) => `<li style="--i:${i}">${nodeHtml(s)}</li>`).join('')}</ol>`;

const hubHtml = (v) => `<div class="vz-hub"><div class="vz-hub__c">${nodeHtml(norm(v.c))}</div><ul class="vz-hub__s">${v.s.map(norm).map((s) => `<li>${nodeHtml(s)}</li>`).join('')}</ul></div>`;

const scaleHtml = (v) => `<div class="vz-scale"><div class="vz-scale__ends"><span>${esc(v.from)}</span><span>${esc(v.to)}</span></div><div class="vz-scale__bar" aria-hidden="true"></div><ol class="vz-scale__s" style="--n:${v.s.length}">${v.s.map(norm).map((s) => `<li>${nodeHtml(s)}</li>`).join('')}</ol></div>`;

const compareHtml = (v) => `<div class="vz-cols" style="--n:${v.cols.length}">${v.cols.map((c) => `<section class="vz-col${toneClass(c.tone)}"><h4>${esc(c.h)}</h4><ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`).join('')}</div>`;

function matrixHtml(v) {
  const cell = (c) => { const [text, t] = Array.isArray(c) ? c : [c]; return `<td class="${toneClass(t).trim()}">${esc(text)}</td>`; };
  return `<div class="vz-matrix" tabindex="0" role="region" aria-label="${esc(v.t)}"><table><thead><tr><td></td>${v.x.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${v.y.map((h, i) => `<tr><th scope="row">${esc(h)}</th>${v.c[i].map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
}

const BODY = { flow: (v) => flowHtml(v, false), cycle: (v) => flowHtml(v, true), layers: layersHtml, hub: hubHtml, scale: scaleHtml, compare: compareHtml, matrix: matrixHtml };

/** One visual as HTML, or nothing if the kind is unknown. */
export function renderVisual(v) {
  const body = BODY[v?.k];
  if (!body) return '';
  return `<figure class="vz vz--${v.k}"><figcaption class="vz__title">${esc(v.t)}</figcaption>${body(v)}${v.n ? `<p class="vz__note">${esc(v.n)}</p>` : ''}</figure>`;
}

/** What is wrong with a visual, for the content check. */
export function visualProblems(v) {
  const out = [];
  if (!KINDS.has(v?.k)) return [`unknown kind "${v?.k}"`];
  if (!v.t) out.push('no title');
  if (['flow', 'cycle', 'layers', 'hub', 'scale'].includes(v.k) && !(Array.isArray(v.s) && v.s.length >= 2)) out.push('needs at least two parts');
  if (Array.isArray(v.s)) for (const raw of v.s) { const s = norm(raw); if (!s?.l) out.push('a part has no label'); if (s?.tone && !TONES.has(s.tone)) out.push(`unknown tone "${s.tone}"`); }
  if (v.k === 'hub' && !norm(v.c)?.l) out.push('no centre');
  if (v.k === 'scale' && !(v.from && v.to)) out.push('needs both ends');
  if (v.k === 'compare' && !(Array.isArray(v.cols) && v.cols.length >= 2 && v.cols.every((c) => c.h && c.items?.length))) out.push('needs at least two filled columns');
  if (v.k === 'matrix' && !(v.x?.length && v.y?.length && v.c?.length === v.y.length && v.c.every((r) => r.length === v.x.length))) out.push('rows and columns do not line up');
  return out;
}
