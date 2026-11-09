#!/usr/bin/env python3
"""Compile the Security+ SY0-801 pathway from content-src/secplus/ into content/secplus-*.json.

Authors write lessons, questions and labs in a small line-based format (documented at the end of this
docstring). This script turns them into the JSON the app loads on demand, and refuses to produce output
when the mappings are wrong. The lesson text deliberately does not go through the content-pack flow: packs
are copied into one localStorage key, which is rewritten on every save, and a full certification course
would put existing progress at risk of the browser's storage limit. Only progress is stored.

Usage: python3 scripts/build-secplus.py [--audit]

Source format, one key per line (a blank line or # starts nothing and is ignored):
  @lesson w5-1                     starts a lesson; @exam a starts a question set; @pbq id starts a PBQ
  title: / obj: 1.1, 1.3 or none / level: Beginner / min: 120 / pre: w1-1, w1-2 or none / domain: text
  out: / why: / plain: / tech: / eg: / mistake: / sum: / diagram: key   (repeatable where it makes sense)
  term: Word == meaning            card: front == back            ref: id r|s     also: day | title
  table: Caption | col | col       then rows "| a | b"
  walk: Title                      then steps "- step"
  lab: Title | minutes | tool      then do: / expect: / explain: / pass:
  scenario: text                   answer: text
  q 1.1,1.2>w5-1 mcq e | Concept | Stem    (kinds mcq multi tf order match; difficulty e m h)
    > literal line of a log or config shown above the options
    + right option :: why it is right
    - wrong option :: why it is wrong
    1. first in sequence          (order questions)
    = left => right               (match questions)
    why: overall explanation (required for order and match)

Product design layer, content-src/secplus/design/*.txt. It is kept apart from the lessons so that design writing
can never count toward exam coverage. One block per lesson, plus @case blocks for the integrated case studies:
  @d w5-1 direct|professional|foundation     how relevant the concept is to product design
  sector: / product: / noex: (why there is no exercise) / ask eng|sec|prod: a stakeholder question
  ex: Title | minutes                        direct lessons only, then the eight required parts:
  scenario: / problem: / task: / constraint: / need: / deliver: / crit constraints|risk|quality|senior: / senior:
  cq m | Concept | Stem                      a design critique question, with + and - options as above
  @case cs1                                  title: week: min: obj: lessons: practice: Text | #link, then the same parts
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "content-src" / "secplus"
OUT = ROOT / "content"
KINDS = {"mcq", "multi", "tf", "order", "match"}
DIFF = {"e", "m", "h"}
LEVELS = {"Beginner", "Intermediate", "Advanced"}
RELEVANCE = {"direct", "professional", "foundation"}
DIMENSIONS = {"constraints", "risk", "quality", "senior"}
ASK_ROLES = {"eng", "sec", "prod"}
# The "real product" examples are archetypes. Naming a company would be a factual claim about it that nobody here has checked.
VENDOR_NAMES = re.compile(r"\b(Slack|Google|Okta|Microsoft|Salesforce|GitHub|Stripe|Figma|Notion|Zoom|Dropbox|Auth0|Atlassian|Splunk|OpenAI|Anthropic|Epic|Workday)\b")
EXAM_BLUEPRINT = {"1": 14, "2": 22, "3": 17, "4": 24, "5": 13}

problems = []


def problem(where, text):
    problems.append(f"{where}: {text}")


def parse_question(header, where):
    m = re.match(r"^q (\S+) (\w+) ([emh]) \| ([^|]+) \| (.+)$", header)
    if not m:
        problem(where, f"bad question header: {header[:80]}")
        return None
    objs, link = m.group(1), None
    if ">" in objs:
        objs, link = objs.split(">", 1)
    kind = m.group(2)
    if kind not in KINDS:
        problem(where, f"unknown question kind {kind}")
    q = {"o": [] if objs == "none" else objs.split(","), "k": kind, "d": m.group(3), "c": m.group(4).strip(), "s": m.group(5).strip()}
    if link:
        q["l"] = link
    return q


def question_line(q, line, where):
    if line.startswith("> "):
        q.setdefault("pre", []).append(line[2:])
    elif line[:2] in ("+ ", "- "):
        text, sep, why = line[2:].partition(" :: ")
        if not sep:
            problem(where, f"option has no explanation: {line[:70]}")
        q.setdefault("a", []).append({"t": text.strip(), "ok": line[0] == "+", "w": why.strip()})
    elif re.match(r"^\d+\. ", line):
        q.setdefault("seq", []).append(line.split(". ", 1)[1].strip())
    elif line.startswith("= "):
        left, sep, right = line[2:].partition(" => ")
        if not sep:
            problem(where, f"bad match row: {line[:70]}")
        q.setdefault("pairs", []).append([left.strip(), right.strip()])
    elif line.startswith("why: "):
        q["why"] = line[5:].strip()
    else:
        problem(where, f"unexpected line in a question: {line[:70]}")


def check_question(q, where, objective_ids):
    for o in q["o"]:
        if o not in objective_ids:
            problem(where, f"question maps to unknown objective {o}")
    k = q["k"]
    if k in ("mcq", "tf"):
        opts = q.get("a", [])
        if sum(a["ok"] for a in opts) != 1:
            problem(where, f"needs exactly one right answer: {q['s'][:60]}")
        if k == "mcq" and len(opts) != 4:
            problem(where, f"multiple choice needs four options: {q['s'][:60]}")
        if k == "tf" and sorted(a["t"] for a in opts) != ["False", "True"]:
            problem(where, f"true/false options must be True and False: {q['s'][:60]}")
    elif k == "multi":
        opts = q.get("a", [])
        right = sum(a["ok"] for a in opts)
        if right < 2 or right >= len(opts) or len(opts) < 4:
            problem(where, f"multiple-select needs 2+ right and 1+ wrong of 4+: {q['s'][:60]}")
    elif k == "order":
        if len(q.get("seq", [])) < 3 or not q.get("why"):
            problem(where, f"ordering needs 3+ steps and a why: {q['s'][:60]}")
    elif k == "match":
        pairs = q.get("pairs", [])
        if len(pairs) < 3 or not q.get("why") or len({r for _, r in pairs}) != len(pairs):
            problem(where, f"matching needs 3+ pairs with unique answers and a why: {q['s'][:60]}")


def parse_file(path, objective_ids):
    lessons, exams, pbqs = [], {}, []
    cur = None
    mode = None  # the block the current line belongs to
    q = None
    table = walk = lab = None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        where = f"{path.name}:{n}"
        if not line or line.startswith("#"):
            continue
        if line.startswith("@lesson "):
            cur = {"id": line.split()[1], "kind": "lesson", "obj": [], "pre": [], "out": [], "plain": [], "tech": [], "terms": [], "eg": [], "blocks": [], "walks": [], "labs": [], "qs": [], "mistakes": [], "sum": [], "refs": [], "cards": [], "also": []}
            lessons.append(cur)
            mode = q = table = walk = lab = None
            continue
        if line.startswith("@exam "):
            cur = {"id": line.split()[1], "kind": "exam", "qs": []}
            exams[cur["id"]] = cur
            mode = q = None
            continue
        if line.startswith("@pbq "):
            cur = {"id": line.split()[1], "_pbq": True, "rows": []}
            pbqs.append(cur)
            mode = q = None
            continue
        if cur is None:
            problem(where, "text before the first @ block")
            continue
        if cur.get("_pbq"):
            parse_pbq_line(cur, line, where)
            continue
        if line.startswith("q "):
            q = parse_question(line, where)
            if q:
                q["_where"] = where
                cur["qs"].append(q)
            mode = "q"
            continue
        if mode == "q" and q is not None and (line[:2] in ("> ", "+ ", "- ", "= ") or re.match(r"^\d+\. ", line) or line.startswith("why: ")):
            question_line(q, line, where)
            continue
        mode = None
        if cur["kind"] != "lesson":
            problem(where, f"unexpected line: {line[:70]}")
            continue
        if line.startswith("| ") and table is not None:
            cells = [c.strip() for c in line[2:].rstrip("|").split(" | ")]
            if len(cells) != len(table["cols"]):
                problem(where, f"table row has {len(cells)} cells, expected {len(table['cols'])}")
            table["rows"].append(cells)
            continue
        if line.startswith("- ") and walk is not None:
            walk["steps"].append(line[2:].strip())
            continue
        key, sep, val = line.partition(": ")
        if not sep:
            problem(where, f"not understood: {line[:70]}")
            continue
        val = val.strip()
        if key in ("title", "level", "domain"):
            cur[key] = val
        elif key == "min":
            cur["min"] = int(val)
        elif key == "obj":
            cur["obj"] = [] if val == "none" else [v.strip() for v in val.split(",")]
        elif key == "pre":
            cur["pre"] = [] if val == "none" else [v.strip() for v in val.split(",")]
        elif key in ("out", "plain", "tech", "eg", "sum"):
            cur[key].append(val)
        elif key == "why":
            cur["why"] = val
        elif key == "mistake":
            cur["mistakes"].append(val)
        elif key == "term":
            t, s, d = val.partition(" == ")
            if not s:
                problem(where, "term needs ==")
            cur["terms"].append([t.strip(), d.strip()])
        elif key == "card":
            t, s, d = val.partition(" == ")
            if not s:
                problem(where, "card needs ==")
            cur["cards"].append([t.strip(), d.strip()])
        elif key == "diagram":
            cur["blocks"].append({"diagram": val})
        elif key == "table":
            parts = [p.strip() for p in val.split(" | ")]
            table = {"caption": parts[0], "cols": parts[1:], "rows": []}
            cur["blocks"].append({"table": table})
        elif key == "walk":
            walk = {"title": val, "steps": []}
            cur["walks"].append(walk)
        elif key == "lab":
            parts = [p.strip() for p in val.split(" | ")]
            if len(parts) != 3:
                problem(where, "lab needs: title | minutes | tool")
                continue
            lab = {"title": parts[0], "min": int(parts[1]), "tool": parts[2], "do": [], "expect": "", "explain": "", "pass": []}
            cur["labs"].append(lab)
        elif key == "do" and lab is not None:
            lab["do"].append(val)
        elif key in ("expect", "explain") and lab is not None:
            lab[key] = val
        elif key == "pass" and lab is not None:
            lab["pass"].append(val)
        elif key in ("scenario", "answer"):
            cur[key] = val
        elif key == "ref":
            parts = val.split()
            cur["refs"].append({"id": parts[0], "req": len(parts) > 1 and parts[1] == "r"})
        elif key == "also":
            day, _, title = val.partition(" | ")
            cur["also"].append({"day": int(day), "title": title.strip()})
        else:
            problem(where, f"unknown key {key}")
    return lessons, exams, pbqs


def parse_pbq_line(cur, line, where):
    key, sep, val = line.partition(": ")
    if line.startswith("| "):
        cells = [c.strip() for c in line[2:].rstrip("|").split(" | ")]
        cur["rows"].append(cells)
    elif key in ("title", "kind", "intro", "min", "why", "lesson"):
        cur[key] = int(val) if key == "min" else val
    elif key == "obj":
        cur["obj"] = [v.strip() for v in val.split(",")]
    elif key == "choices":
        cur["choices"] = [v.strip() for v in val.split(" | ")]
    elif key == "cols":
        cur["cols"] = [v.strip() for v in val.split(" | ")]
    elif key == "context":
        cur.setdefault("context", []).append(val)
    elif key == "pass":
        cur["pass"] = int(val)
    elif not sep:
        problem(where, f"not understood: {line[:70]}")
    else:
        problem(where, f"unknown PBQ key {key}")


def parse_design(path, objective_ids):
    """One design block per lesson, and the case studies."""
    blocks, cases = {}, []
    cur = q = None
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        where = f"{path.name}:{n}"
        if not line or line.startswith("#"):
            continue
        if line.startswith("@d "):
            parts = line.split()
            if len(parts) != 3 or parts[2] not in RELEVANCE:
                problem(where, f"bad design header: {line}")
                continue
            cur = {"rel": parts[2], "product": [], "asks": {"eng": [], "sec": [], "prod": []}}
            if parts[1] in blocks:
                problem(where, f"repeated design block {parts[1]}")
            blocks[parts[1]] = cur
            q = None
            continue
        if line.startswith("@case "):
            cur = {"id": line.split()[1], "rel": "direct", "practice": [], "ex": {"title": "", "min": 0}, "product": [], "asks": {"eng": [], "sec": [], "prod": []}, "_case": True}
            cases.append(cur)
            q = None
            continue
        if cur is None:
            problem(where, "text before the first design block")
            continue
        if line.startswith("cq "):
            ex = cur.get("ex")
            if ex is None:
                problem(where, "a critique question needs an exercise")
                continue
            m = re.match(r"^cq ([emh]) \| ([^|]+) \| (.+)$", line)
            if not m:
                problem(where, f"bad critique header: {line[:70]}")
                continue
            q = {"o": [], "k": "mcq", "d": m.group(1), "c": m.group(2).strip(), "s": m.group(3).strip()}
            ex.setdefault("cq", []).append(q)
            continue
        if q is not None and line[:2] in ("+ ", "- "):
            question_line(q, line, where)
            continue
        q = None
        key, sep, val = line.partition(": ")
        if not sep:
            problem(where, f"not understood: {line[:70]}")
            continue
        val = val.strip()
        word, _, sub = key.partition(" ")
        if VENDOR_NAMES.search(val):
            problem(where, f"names a company, use an archetype: {val[:70]}")
        ex = cur.get("ex")
        if key in ("sector", "noex"):
            cur[key] = val
        elif key == "product":
            cur["product"].append(val)
        elif word == "ask" and sub in ASK_ROLES:
            cur["asks"][sub].append(val)
        elif key == "ex":
            title, _, mins = val.partition(" | ")
            cur["ex"] = {"title": title.strip(), "min": int(mins)}
        elif cur.get("_case") and key == "title":
            ex["title"] = val
        elif cur.get("_case") and key == "min":
            ex["min"] = int(val)
        elif cur.get("_case") and key == "week":
            cur["week"] = int(val)
        elif cur.get("_case") and key in ("obj", "lessons"):
            cur[key] = [v.strip() for v in val.split(",")]
        elif cur.get("_case") and key == "practice":
            text, _, link = val.partition(" | ")
            cur["practice"].append({"t": text.strip(), "link": link.strip()})
        elif ex is None:
            problem(where, f"{key} needs an exercise first")
        elif key in ("scenario", "problem", "deliver"):
            ex[key] = val
        elif key in ("task", "constraint", "need", "senior"):
            ex.setdefault(key + "s", []).append(val)
        elif word == "crit" and sub in DIMENSIONS:
            ex.setdefault("crit", []).append({"d": sub, "t": val})
        else:
            problem(where, f"unknown design key {key}")
    return blocks, cases


def check_exercise(owner, ex, objective_ids):
    """All eight parts of a design exercise, and an assessment that spans all four competencies."""
    if not ex.get("title") or not ex.get("min"):
        problem(owner, "exercise needs a title and minutes")
    for key in ("scenario", "problem", "deliver"):
        if not ex.get(key):
            problem(owner, f"exercise needs {key}")
    for key, least in (("tasks", 2), ("constraints", 2), ("needs", 2), ("seniors", 2)):
        if len(ex.get(key, [])) < least:
            problem(owner, f"exercise needs at least {least} {key}")
    missing = DIMENSIONS - {c["d"] for c in ex.get("crit", [])}
    if missing:
        problem(owner, f"evaluation criteria missing {sorted(missing)}")
    if not ex.get("cq"):
        problem(owner, "exercise needs a design critique question")
    for i, q in enumerate(ex.get("cq", []), 1):
        q["id"] = f"d-{owner}-{i}"
        check_question(q, owner, objective_ids)


def term_candidates(text):
    """The ways an official subtopic may be written in teaching text: its name, its acronym, or the parts of a slash pair."""
    out = set()
    acronyms = re.findall(r"\(([A-Za-z0-9/&-]{2,})\)", text)
    bare = re.sub(r"\s*\([^)]*\)", "", text).strip()
    out.add(bare.lower())
    for part in re.split(r"/| vs\. ", bare):
        if len(part.strip()) > 2:
            out.add(part.strip().lower())
    for a in acronyms:
        for part in a.split("/"):
            out.add(part.lower())
    return {c for c in out if c}


def taught_text(lesson):
    bits = [lesson.get("title", ""), lesson.get("why", ""), *lesson["plain"], *lesson["tech"], *lesson["eg"], *lesson["sum"], *lesson["mistakes"], lesson.get("scenario", ""), lesson.get("answer", "")]
    bits += [f"{t} {d}" for t, d in lesson["terms"]]
    for b in lesson["blocks"]:
        if "table" in b:
            bits += [" ".join(b["table"]["cols"]), b["table"]["caption"]] + [" ".join(r) for r in b["table"]["rows"]]
    for w in lesson["walks"]:
        bits += [w["title"], *w["steps"]]
    return re.sub(r"\s+", " ", " ".join(bits)).lower().replace("‑", "-")


def found(candidates, text):
    for c in candidates:
        if len(c) <= 4:
            if re.search(r"(?<![a-z0-9])" + re.escape(c) + r"(?![a-z0-9])", text):
                return True
        elif c in text or c.rstrip("s") in text:
            return True
    return False


def main():
    audit = "--audit" in sys.argv
    meta = json.loads((SRC / "curriculum.json").read_text(encoding="utf-8"))
    # The verbatim objectives are CompTIA's copyright: they stay in a git-ignored folder and only feed the local audit.
    local_objectives = SRC / "local" / "objectives.json"
    objectives = json.loads(local_objectives.read_text(encoding="utf-8"))["objectives"] if local_objectives.exists() else []
    objective_ids = {o["id"] for o in meta["objectives"]}
    references = json.loads((SRC / "references.json").read_text(encoding="utf-8"))
    ref_by_id = {r["id"]: r for r in references}

    lessons, exams, pbqs = [], {}, []
    for path in sorted(SRC.glob("*.txt")):
        if path.name.startswith("objectives"):
            continue
        ls, ex, pb = parse_file(path, objective_ids)
        lessons += ls
        exams.update(ex)
        pbqs += pb

    by_id = {}
    for l in lessons:
        if l["id"] in by_id:
            problem(l["id"], "repeated lesson id")
        by_id[l["id"]] = l

    design, cases = {}, []
    for path in sorted((SRC / "design").glob("*.txt")):
        blocks, cs = parse_design(path, objective_ids)
        design.update(blocks)
        cases += cs
    for lid, block in design.items():
        if lid not in by_id:
            problem(lid, "design block has no lesson")
            continue
        by_id[lid]["design"] = block
        ok_asks = all(block["asks"][r] for r in ASK_ROLES)
        if not block["product"]:
            problem(lid, "needs product text")
        if block["rel"] == "direct":
            if "ex" not in block:
                problem(lid, "a direct lesson needs an exercise")
            else:
                check_exercise(lid, block["ex"], objective_ids)
            if not ok_asks:
                problem(lid, "needs questions for engineering, security and product")
        else:
            if "ex" in block:
                problem(lid, "only direct lessons have exercises, so as not to force one")
            if not block.get("noex"):
                problem(lid, "needs noex, saying why there is no exercise")
            if block["rel"] == "professional" and not ok_asks:
                problem(lid, "needs questions for engineering, security and product")
    for i in by_id:
        if i not in design:
            problem(i, "lesson has no design block")
    for c in cases:
        c.pop("_case", None)
        check_exercise(c["id"], c["ex"], objective_ids)
        for key in ("week", "obj", "lessons", "sector"):
            if not c.get(key):
                problem(c["id"], f"case study needs {key}")
        if not c["practice"]:
            problem(c["id"], "case study needs its technical half")
        for o in c.get("obj", []):
            if o not in objective_ids:
                problem(c["id"], f"unknown objective {o}")
        for x in c.get("lessons", []):
            if x not in by_id:
                problem(c["id"], f"unknown lesson {x}")
        week = next((w for w in meta["weeks"] if w["n"] == c.get("week")), None)
        if week is not None:
            week["sessions"].append({"type": "case", "id": c["id"], "title": f"Case study: {c['ex']['title']}", "min": c["ex"]["min"], "link": f"#cert/case/{c['id']}", "detail": "Technical and design"})

    order = [s["id"] for w in meta["weeks"] for s in w["sessions"] if s["type"] == "lesson"]
    missing_written = [i for i in order if i not in by_id]
    for i in by_id:
        if i not in order:
            problem(i, "lesson is not in curriculum.json")
    for pos, lid in enumerate(order):
        if lid not in by_id:
            continue
        l = by_id[lid]
        l["n"] = pos + 1
        l["next"] = next((x for x in order[pos + 1:] if x in by_id), None)
        for req in ("title", "level", "min", "why"):
            if req not in l:
                problem(lid, f"missing {req}")
        if l.get("level") not in LEVELS:
            problem(lid, f"bad level {l.get('level')}")
        for o in l["obj"]:
            if o not in objective_ids:
                problem(lid, f"unknown objective {o}")
        for p in l["pre"]:
            if p not in order or order.index(p) >= pos:
                problem(lid, f"prerequisite {p} does not come earlier")
        for sect, least in (("out", 2), ("plain", 1), ("tech", 1), ("terms", 3), ("eg", 1), ("walks", 1), ("labs", 1), ("qs", 3), ("mistakes", 1), ("sum", 1), ("cards", 1)):
            if len(l[sect]) < least:
                problem(lid, f"needs at least {least} {sect}")
        if not l.get("scenario") or not l.get("answer"):
            problem(lid, "needs a scenario and an answer")
        if not l["refs"]:
            problem(lid, "needs at least one reference")
        if not any(r["req"] for r in l["refs"]):
            problem(lid, "needs one required reference")
        for r in l["refs"]:
            if r["id"] not in ref_by_id:
                problem(lid, f"unknown reference {r['id']}")
        for lab_i, lab in enumerate(l["labs"], 1):
            lab["id"] = f"{lid}-lab{lab_i}"
            if not lab["do"] or not lab["expect"] or not lab["explain"] or not lab["pass"]:
                problem(lid, f"lab {lab_i} needs do, expect, explain and pass")
        for i, q in enumerate(l["qs"], 1):
            q["id"] = f"{lid}-q{i}"
            if not q["o"]:
                q["o"] = list(l["obj"])
            q.setdefault("l", lid)
            where = q.pop("_where", lid)
            check_question(q, where, objective_ids)

    for eid, ex in exams.items():
        for i, q in enumerate(ex["qs"], 1):
            q["id"] = f"x{eid}-{i:03d}"
            where = q.pop("_where", eid)
            check_question(q, where, objective_ids)
            if not q["o"]:
                problem(where, "an exam question needs an objective")
            if q.get("l") not in by_id and by_id:
                problem(where, f"exam question must link to a written lesson, got {q.get('l')}")

    # Exam blueprint: exactly the published weighting, rounded to 90.
    exam_report = {}
    for eid, ex in exams.items():
        if eid not in ("a", "b"):
            continue
        counts = {}
        per_obj = {}
        for q in ex["qs"]:
            d = q["o"][0][0]
            counts[d] = counts.get(d, 0) + 1
            per_obj[q["o"][0]] = per_obj.get(q["o"][0], 0) + 1
        exam_report[eid] = {"domains": counts, "objectives": per_obj, "total": len(ex["qs"])}
        if counts != EXAM_BLUEPRINT:
            problem(f"exam {eid}", f"domain counts {counts} differ from the blueprint {EXAM_BLUEPRINT}")
        missing_obj = objective_ids - set(per_obj)
        if missing_obj:
            problem(f"exam {eid}", f"no question for objectives {sorted(missing_obj)}")

    # Coverage: each official subtopic must be taught in a lesson mapped to its objective.
    coverage = []
    written = [by_id[i] for i in order if i in by_id]
    texts = {l["id"]: taught_text(l) for l in written}
    for o in objectives:
        mapped = [l for l in written if o["id"] in l["obj"]]
        rows = []
        for item in o["items"]:
            cands = term_candidates(item["text"])
            where_taught = [l["id"] for l in mapped if found(cands, texts[l["id"]])]
            rows.append({"text": item["text"], "parent": item["parent"], "lessons": where_taught})
        # A heading is covered when its own name is taught, or when everything listed under it is.
        for row in rows:
            path = f'{row["parent"]} > {row["text"]}' if row["parent"] else row["text"]
            kids = [r for r in rows if r["parent"] == path or r["parent"].startswith(path + " > ")]
            if kids and not row["lessons"] and all(k["lessons"] for k in kids):
                row["lessons"] = sorted({x for k in kids for x in k["lessons"]})
        coverage.append({"id": o["id"], "lessons": [l["id"] for l in mapped], "rows": rows})

    # Reference join: which lessons and objectives each reference serves.
    for r in references:
        r["lessons"], r["objectives"], r["required"] = [], [], False
    for l in written:
        for lr in l["refs"]:
            r = ref_by_id.get(lr["id"])
            if not r:
                continue
            r["lessons"].append(l["id"])
            r["required"] = r["required"] or lr["req"]
            for o in l["obj"]:
                if o not in r["objectives"]:
                    r["objectives"].append(o)
    for r in references:
        if not r.get("free", False):
            problem(r["id"], "every reference must be recorded as free")

    domain_of = lambda oid: oid[0]
    total = sum(len(c["rows"]) for c in coverage)
    uncovered = [(c["id"], row["parent"], row["text"]) for c in coverage for row in c["rows"] if not row["lessons"]]
    print(f"lessons written: {len(written)} of {len(order)}; questions: {sum(len(l['qs']) for l in written)} in lessons, {sum(len(e['qs']) for e in exams.values())} in exams; PBQs: {len(pbqs)}; labs: {sum(len(l['labs']) for l in written)}")
    print(f"subtopics taught: {total - len(uncovered)} of {total}")
    rels = [l.get("design", {}).get("rel") for l in written]
    print(f"design relevance: {rels.count('direct')} direct, {rels.count('professional')} professional, {rels.count('foundation')} foundation; case studies: {len(cases)}")

    if problems:
        print(f"\n{len(problems)} problem(s):")
        for p in problems[:80]:
            print(" -", p)
        sys.exit(1)

    # Revision sheets reuse tables already taught and checked, so the same fact cannot drift between two places.
    SHEETS = [
        ("ports", "Common ports and secure alternatives", [("w3-2", "Common ports to memorize"), ("w3-3", "Insecure and secure alternatives")]),
        ("crypto", "Cryptography comparisons", [("w5-4", "Encryption, hashing and more"), ("w5-5", "Revocation compared")]),
        ("iam", "Identity and access", [("w11-3", "Identity standards compared"), ("w11-4", "Access control models"), ("w5-1", "Commonly confused pairs")]),
        ("attacks", "Attack recognition", [("w7-2", "Malware by behaviour"), ("w7-3", "Commonly confused"), ("w7-4", "AI threats compared"), ("w7-1", "Similar-sounding terms")]),
        ("secops", "Security operations", [("w10-1", "Commonly confused"), ("w11-2", "Commonly confused"), ("w10-3", "Email authentication"), ("w5-2", "Control examples")]),
        ("ir", "Incident response and recovery", [("w12-2", "Incident response stages"), ("w9-4", "Recovery metrics"), ("w9-3", "Recovery sites"), ("w13-2", "Risk treatments")]),
    ]
    sheets = []
    for sid, title, picks in SHEETS:
        tables = []
        for lid, cap in picks:
            found_t = [b["table"] for b in by_id.get(lid, {"blocks": []})["blocks"] if "table" in b and b["table"]["caption"] == cap]
            if not found_t:
                problem(sid, f"revision sheet table not found: {lid} {cap}")
            else:
                tables.append(found_t[0])
        sheets.append({"id": sid, "title": title, "tables": tables})
    # Acronyms come from the lessons' own definitions.
    acr = {}
    for l in written:
        for t, d in l["terms"]:
            if re.fullmatch(r"[A-Za-z0-9/&.-]{2,12}", t) and sum(ch.isupper() for ch in t) >= 2 and t not in acr:
                acr[t] = d
    sheets.append({"id": "acronyms", "title": "Acronym revision", "tables": [{"caption": "Acronyms from the lessons", "cols": ["Acronym", "Meaning"], "rows": [[k, acr[k]] for k in sorted(acr, key=str.lower)]}]})
    meta["sheets"] = sheets
    if problems:
        print("\n".join(problems[:40]))
        sys.exit(1)

    index = {
        "schema": "atlas.secplus.index.v1",
        "exam": meta["exam"],
        "domains": meta["domains"],
        "objectives": [{"id": o["id"], "title": o["short"], "domain": o["id"][0], "lessons": [l["id"] for l in written if o["id"] in l["obj"]]} for o in meta["objectives"]],
        "weeks": meta["weeks"],
        "sections": meta["sections"],
        "lessons": [{"id": l["id"], "n": l["n"], "title": l["title"], "level": l["level"], "min": l["min"], "obj": l["obj"], "pre": l["pre"], "domain": l.get("domain", ""), "week": next(w["n"] for w in meta["weeks"] if any(s.get("id") == l["id"] for s in w["sessions"])), "labs": [{"id": x["id"], "title": x["title"], "min": x["min"], "tool": x["tool"]} for x in l["labs"]], "q": len(l["qs"]), "next": l["next"], "rel": l["design"]["rel"] if "design" in l else None} for l in written],
        "modules": meta["modules"],
        "designs": [{"id": l["id"], "kind": "lesson", "title": l["design"]["ex"]["title"], "min": l["design"]["ex"]["min"], "week": next(w["n"] for w in meta["weeks"] if any(s.get("id") == l["id"] for s in w["sessions"])), "deliver": l["design"]["ex"]["deliver"], "crit": [c["d"] for c in l["design"]["ex"]["crit"]], "cq": [q["id"] for q in l["design"]["ex"]["cq"]]} for l in written if l.get("design", {}).get("rel") == "direct"] + [{"id": c["id"], "kind": "case", "title": c["ex"]["title"], "min": c["ex"]["min"], "week": c["week"], "deliver": c["ex"]["deliver"], "crit": [x["d"] for x in c["ex"]["crit"]], "cq": [q["id"] for q in c["ex"]["cq"]]} for c in cases],
        "objectivePool": {o["id"]: sum(1 for l in written for q in l["qs"] if o["id"] in q["o"]) for o in meta["objectives"]},
        "unwritten": missing_written,
        "references": references,
        "pbqs": [{"id": p["id"], "title": p["title"], "kind": p["kind"], "obj": p["obj"], "min": p["min"]} for p in pbqs],
        "examReport": exam_report,
        "sheets": meta["sheets"],
    }
    write = lambda name, doc: (OUT / name).write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    write("secplus-index.json", index)
    for w in meta["weeks"]:
        chunk = [by_id[s["id"]] for s in w["sessions"] if s["type"] == "lesson" and s["id"] in by_id]
        if chunk:
            write(f"secplus-w{w['n']:02d}.json", {"schema": "atlas.secplus.week.v1", "lessons": chunk})
    write("secplus-cases.json", {"schema": "atlas.secplus.cases.v1", "cases": cases})
    write("secplus-exams.json", {"schema": "atlas.secplus.exams.v1", "exams": exams})
    for p in pbqs:
        p.pop("_pbq", None)
    write("secplus-pbq.json", {"schema": "atlas.secplus.pbq.v1", "pbqs": pbqs})
    # Public: counts per objective only. The row-by-row list names every official subtopic, so it stays local.
    if coverage:
        write("secplus-coverage.json", {"schema": "atlas.secplus.coverage.v1", "objectives": [{"id": c["id"], "lessons": c["lessons"], "subtopics": len(c["rows"]), "taught": sum(1 for r in c["rows"] if r["lessons"])} for c in coverage]})
        (SRC / "local" / "coverage-detail.json").write_text(json.dumps(coverage, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "secplus-acronyms.json").unlink(missing_ok=True)
    diagrams = SRC / "diagrams.json"
    if diagrams.exists():
        write("secplus-diagrams.json", json.loads(diagrams.read_text(encoding="utf-8")))
    acronyms = SRC / "glossary.json"
    if acronyms.exists():
        write("secplus-glossary.json", json.loads(acronyms.read_text(encoding="utf-8")))

    if audit:
        for oid, parent, text in uncovered:
            print(f"UNCOVERED {oid} {parent} > {text}")
        for eid, rep in exam_report.items():
            print(eid, rep["total"], rep["domains"])


if __name__ == "__main__":
    main()
