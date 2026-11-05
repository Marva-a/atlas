// Checks every content pack with the same parsers the app uses, and that every lesson step
// points at a resource that exists. Run from the repo root: node scripts/validate-content.mjs
import fs from 'node:fs';
import { parseLessonPack, parsePathwayPack, parseGuidancePack, parseCardPack, validateManifest } from '../js/content.js';
import { parseResourceImport } from '../js/resource-import.js';

const manifest = JSON.parse(fs.readFileSync('content/manifest.json', 'utf8'));
const vm = validateManifest(manifest);
if (!vm.ok) {
  console.log('manifest: FAIL', vm.problems);
  process.exit(1);
}
console.log('manifest: OK');

let failed = false;
const resourceIds = new Set();
const steps = [];
const lessonIds = new Map();
const daySlots = new Map();
const seeLesson = (where, l) => {
  if (lessonIds.has(l.id)) { failed = true; console.log(`repeated lesson id "${l.id}": ${lessonIds.get(l.id)} and ${where}`); }
  lessonIds.set(l.id, where);
  if (l.day === undefined) return;
  const slot = `${l.day}:${l.part}`;
  if (daySlots.has(slot)) { failed = true; console.log(`day ${l.day} part ${l.part} has two lessons: ${daySlots.get(slot)} and ${where}`); }
  daySlots.set(slot, where);
};
const report = (path, result, count) => {
  if (result.ok) console.log(`${path}: OK${count === undefined ? '' : ` (${count})`}`);
  else {
    failed = true;
    console.log(`${path}: FAIL`, JSON.stringify([...(result.fileProblems ?? []), ...(result.rowProblems ?? [])], null, 1));
  }
};

for (const pack of vm.packs) {
  const text = fs.readFileSync(`content/${pack.path}`, 'utf8');
  if (pack.type === 'resources') {
    const r = parseResourceImport(text, []);
    for (const row of JSON.parse(text).resources) resourceIds.add(row.id);
    report(pack.path, r, `${r.rows.length} resources`);
  } else if (pack.type === 'lessons') {
    const r = parseLessonPack(text);
    r.lessons.forEach((l) => { seeLesson(pack.path, l); l.steps.forEach((s) => steps.push([`${pack.path} ${l.id}`, s.resourceId])); });
    report(pack.path, r, `${r.lessons.length} lessons`);
  } else if (pack.type === 'pathway') {
    const r = parsePathwayPack(text);
    r.lessons.forEach((l) => { seeLesson(pack.path, l); l.steps.forEach((s) => steps.push([`${pack.path} ${l.id}`, s.resourceId])); });
    report(pack.path, r, r.pathway?.retired ? 'retired pathway' : `${r.lessons.length} lessons, ${r.pathway?.coreDays.length ?? 0} calendar days`);
  } else if (pack.type === 'guidance') {
    report(pack.path, parseGuidancePack(text));
  } else {
    report(pack.path, parseCardPack(text));
  }
}

for (const [where, id] of steps) {
  if (id !== null && !resourceIds.has(id)) {
    failed = true;
    console.log(`missing resource: ${where} points at "${id}"`);
  }
}
if (failed) process.exit(1);
console.log('All packs OK; every step resource exists.');
