// Security+ pathway: grading, mastery and readiness rules. Pure functions, so js/selftest.js can run them in Node.
//
// Reading a lesson never makes an objective "mastered". Status comes from what you demonstrate:
//   Not started → Learning (you began) → Practiced (lessons, labs and questions) → Reviewed (you retook it later)
//   → Mastered (you also did well on timed exam questions).
// These thresholds are Atlas's own teaching rules. CompTIA does not publish how raw answers convert to its
// 100–900 scale, so no percentage here is, or is shown as, a predicted exam score.

export const STATUSES = ['not-started', 'learning', 'practiced', 'reviewed', 'mastered'];
export const STATUS_LABELS = { 'not-started': 'Not started', learning: 'Learning', practiced: 'Practiced', reviewed: 'Reviewed', mastered: 'Mastered' };

export const RULES = {
  practicedAccuracy: 0.7, practicedAnswered: 10,
  reviewPassScore: 0.8, reviewMinQuestions: 5, reviewDelayMs: 86_400_000,
  masteredAccuracy: 0.85, masteredExamSeen: 3, masteredExamAccuracy: 0.85,
  readyExamScore: 0.85, readyDomainScore: 0.75, readyPbqScore: 0.8,
};

export function emptyCert() {
  return { lessons: {}, labs: {}, q: {}, reviews: [], exams: [], active: null, pbq: {}, extraWeeks: {}, design: {} };
}

/** A small seeded generator, so a question keeps its shuffled order through page redraws. */
function seeded(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Indexes 0..n-1 in an order that depends only on the seed. */
export function shuffledIndexes(n, seedText) {
  const rand = seeded(String(seedText));
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Has the response been filled in enough to grade? */
export function isAnswered(q, response) {
  if (response === undefined || response === null) return false;
  if (q.k === 'mcq' || q.k === 'tf') return Number.isInteger(response);
  if (q.k === 'multi') return Array.isArray(response) && response.length > 0;
  if (q.k === 'order') return Array.isArray(response) && response.length === q.seq.length;
  if (q.k === 'match') return Array.isArray(response) && response.length === q.pairs.length && response.every((r) => Number.isInteger(r));
  return false;
}

/**
 * Grades one response. mcq/tf: the option index. multi: option indexes (all and only the right ones).
 * order: step indexes in the order chosen. match: for each row, the index of the chosen right-hand item.
 */
export function gradeQuestion(q, response) {
  if (!isAnswered(q, response)) return false;
  if (q.k === 'mcq' || q.k === 'tf') return Boolean(q.a[response]?.ok);
  if (q.k === 'multi') {
    const chosen = new Set(response);
    return q.a.every((a, i) => a.ok === chosen.has(i));
  }
  if (q.k === 'order') return response.every((step, i) => step === i);
  if (q.k === 'match') return response.every((r, i) => r === i);
  return false;
}

/** Records one graded answer, keeping only what progress needs. */
export function recordAnswer(cert, q, correct, at = Date.now()) {
  const row = cert.q[q.id] ?? { o: q.o, n: 0, c: 0, last: 0, at: 0 };
  row.o = q.o;
  row.n += 1;
  row.c += correct ? 1 : 0;
  row.last = correct ? 1 : 0;
  row.at = at;
  cert.q[q.id] = row;
}

/** The most recent attempt at each exam, because an old sitting should not hide what you know now. */
export function latestExams(cert) {
  const latest = new Map();
  for (const e of cert.exams) if (!latest.has(e.id) || latest.get(e.id).at < e.at) latest.set(e.id, e);
  return [...latest.values()];
}

/** A review needs five questions, or every question there is for an objective with fewer. */
export function reviewMinimum(pool) {
  return Math.min(RULES.reviewMinQuestions, pool ?? RULES.reviewMinQuestions);
}

/** The evidence for one objective. `objective` comes from the index; `labsOf` lists a lesson's lab ids. */
export function objectiveMetrics(objective, cert, labsOf) {
  const lessonIds = objective.lessons;
  const doneAt = lessonIds.map((id) => cert.lessons[id]).filter(Boolean);
  const labs = lessonIds.flatMap((id) => labsOf(id));
  const rows = Object.values(cert.q).filter((r) => r.o.includes(objective.id));
  const correctNow = rows.filter((r) => r.last === 1).length;
  const lastLesson = doneAt.length ? Math.max(...doneAt) : 0;
  const reviewPass = cert.reviews.some((r) => r.obj === objective.id && r.n >= reviewMinimum(objective.pool) && r.r / r.n >= RULES.reviewPassScore
    && doneAt.length === lessonIds.length && r.at - lastLesson >= RULES.reviewDelayMs);
  let examSeen = 0;
  let examRight = 0;
  for (const e of latestExams(cert)) {
    const [r, n] = e.byObj[objective.id] ?? [0, 0];
    examRight += r;
    examSeen += n;
  }
  return {
    lessonsTotal: lessonIds.length, lessonsDone: doneAt.length,
    labsTotal: labs.length, labsDone: labs.filter((id) => cert.labs[id]).length,
    answered: rows.length, accuracy: rows.length ? correctNow / rows.length : 0,
    pool: objective.pool ?? RULES.practicedAnswered, reviewPass,
    examSeen, examAccuracy: examSeen ? examRight / examSeen : 0,
  };
}

export function objectiveStatus(m) {
  if (!m.lessonsDone && !m.answered && !m.examSeen) return 'not-started';
  const enough = Math.min(RULES.practicedAnswered, m.pool);
  const practiced = m.lessonsTotal > 0 && m.lessonsDone === m.lessonsTotal
    && m.labsDone >= Math.ceil(m.labsTotal / 2)
    && m.answered >= enough && m.accuracy >= RULES.practicedAccuracy;
  if (!practiced) return 'learning';
  if (!m.reviewPass) return 'practiced';
  const mastered = m.accuracy >= RULES.masteredAccuracy && m.examSeen >= RULES.masteredExamSeen && m.examAccuracy >= RULES.masteredExamAccuracy;
  return mastered ? 'mastered' : 'reviewed';
}

/** Scores a finished exam by domain and objective. Each question counts for its first objective. */
export function examReport(id, questions, responses, { at = Date.now(), ms = 0 } = {}) {
  const byDomain = {};
  const byObj = {};
  const wrong = [];
  let right = 0;
  for (const q of questions) {
    const ok = gradeQuestion(q, responses[q.id]);
    const obj = q.o[0];
    const domain = obj[0];
    byDomain[domain] ??= [0, 0];
    byObj[obj] ??= [0, 0];
    byDomain[domain][1] += 1;
    byObj[obj][1] += 1;
    if (ok) {
      right += 1;
      byDomain[domain][0] += 1;
      byObj[obj][0] += 1;
    } else wrong.push(q.id);
  }
  return { id, at, ms, n: questions.length, right, byDomain, byObj, wrong };
}

/**
 * Objectives to work on first, weakest evidence first, weighted by how much of the exam the domain covers.
 * Anything not started is left out until you have reached it, so this list is about real weaknesses.
 */
export function weakObjectives(objectives, metricsById, domains) {
  const scored = [];
  for (const o of objectives) {
    const m = metricsById[o.id];
    if (!m.answered && !m.examSeen) continue;
    const samples = [];
    if (m.answered) samples.push(m.accuracy);
    if (m.examSeen) samples.push(m.examAccuracy);
    const score = Math.min(...samples);
    if (score >= RULES.masteredAccuracy) continue;
    scored.push({ id: o.id, score, weight: domains[o.domain].weight });
  }
  return scored.sort((a, b) => (a.score - b.score) || (b.weight - a.weight));
}

/** Atlas's readiness bar, line by line. Finishing the weeks is not on it, on purpose. */
export function readiness(cert, statuses, pbqTotal) {
  const count = (list) => statuses.filter((s) => list.includes(s)).length;
  const exams = latestExams(cert);
  const examOf = (id) => exams.find((e) => e.id === id);
  const passExam = (e) => Boolean(e) && e.right / e.n >= RULES.readyExamScore;
  const domainsOk = (e) => Boolean(e) && Object.values(e.byDomain).every(([r, n]) => r / n >= RULES.readyDomainScore);
  const pbqs = Object.values(cert.pbq);
  const pbqOk = pbqs.filter((p) => p.best >= RULES.readyPbqScore).length;
  const lines = [
    { key: 'practiced', label: 'All 27 objectives are at least Practiced', ok: count(['practiced', 'reviewed', 'mastered']) === statuses.length && statuses.length === 27 },
    { key: 'reviewed', label: 'At least 24 objectives are Reviewed or Mastered', ok: count(['reviewed', 'mastered']) >= 24 },
    { key: 'examA', label: 'Latest score on mock exam A is 85% or higher', ok: passExam(examOf('a')) },
    { key: 'examB', label: 'Latest score on mock exam B is 85% or higher', ok: passExam(examOf('b')) },
    { key: 'domains', label: 'Every domain is 75% or higher on both latest mock exams', ok: domainsOk(examOf('a')) && domainsOk(examOf('b')) },
    { key: 'pbq', label: 'Every performance-based exercise has reached 80% or higher', ok: pbqTotal > 0 && pbqOk === pbqTotal },
  ];
  const met = lines.filter((l) => l.ok).length;
  return { lines, met, ready: met === lines.length };
}

// ─── Product design competency ──────────────────────────────────────────────────
//
// A second, independent measure. Nothing below reads quiz, lab or exam results, and nothing above reads
// cert.design, so a design exercise can never raise technical mastery and a passed exam can never raise design
// competency. The two are never combined into one score. A rating is the learner's own judgment against written
// criteria, and the app says so wherever it shows one.

export const DESIGN_STATUSES = ['not-started', 'in-progress', 'delivered', 'self-assessed', 'meets'];
export const DESIGN_LABELS = { 'not-started': 'Not started', 'in-progress': 'In progress', delivered: 'Deliverable made', 'self-assessed': 'Self-assessed', meets: 'Meets criteria' };
export const DESIGN_RULES = { defenseMin: 150 };
export const DESIGN_DIMENSIONS = { constraints: 'Understanding security constraints', risk: 'Identifying product security risks', quality: 'Design quality and usability', senior: 'Senior-level decision-making' };
export const RATING_LABELS = ['Not yet', 'Partly', 'Meets'];

/** `ex` comes from the index: { crit: [dimension, ...], cq: [questionId, ...] }. */
export function designStatus(ex, entry) {
  if (!entry) return 'not-started';
  const rate = entry.rate ?? {};
  const cq = entry.cq ?? {};
  const started = entry.work || entry.link || entry.delivered || entry.defense || Object.keys(rate).length || Object.keys(cq).length;
  if (!started) return 'not-started';
  if (!entry.delivered) return 'in-progress';
  const rated = ex.crit.every((_, i) => Number.isInteger(rate[i]));
  const defended = (entry.defense ?? '').trim().length >= DESIGN_RULES.defenseMin;
  const critiqued = ex.cq.every((id) => cq[id] === 0 || cq[id] === 1);
  if (!rated || !defended || !critiqued) return 'delivered';
  return ex.crit.every((_, i) => rate[i] === 2) && ex.cq.every((id) => cq[id] === 1) ? 'meets' : 'self-assessed';
}

/** Each competency separately, as counts. There is deliberately no overall figure. */
export function designSummary(list, design) {
  const out = { total: list.length, delivered: 0, assessed: 0, meets: 0, critiqueRight: 0, critiqueTotal: 0, dims: {} };
  for (const d of Object.keys(DESIGN_DIMENSIONS)) out.dims[d] = { meets: 0, partly: 0, rated: 0, total: 0 };
  for (const ex of list) {
    const entry = design[ex.id];
    const status = designStatus(ex, entry);
    if (['delivered', 'self-assessed', 'meets'].includes(status)) out.delivered += 1;
    if (['self-assessed', 'meets'].includes(status)) out.assessed += 1;
    if (status === 'meets') out.meets += 1;
    ex.crit.forEach((d, i) => {
      const r = entry?.rate?.[i];
      out.dims[d].total += 1;
      if (!Number.isInteger(r)) return;
      out.dims[d].rated += 1;
      if (r === 2) out.dims[d].meets += 1;
      if (r === 1) out.dims[d].partly += 1;
    });
    for (const id of ex.cq) {
      out.critiqueTotal += 1;
      if (entry?.cq?.[id] === 1) out.critiqueRight += 1;
    }
  }
  return out;
}

// ─── Flashcards from a lesson ────────────────────────────────────────────────

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every flashcard a lesson can give you: its written key-idea cards first, then one card for each
 * key term. A term already asked about in a key-idea card is left out, so nothing appears twice.
 */
export function lessonDeck(lesson) {
  const ideas = (lesson.cards ?? []).map(([front, back]) => ({ front, back, kind: 'idea' }));
  const asked = (term) => ideas.some((c) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}($|[^\\p{L}\\p{N}])`, 'iu').test(c.front));
  const terms = (lesson.terms ?? []).filter(([t, x]) => t && x && !asked(t)).map(([t, x]) => ({ front: `What does “${t}” mean?`, back: x, kind: 'term' }));
  return [...ideas, ...terms];
}

