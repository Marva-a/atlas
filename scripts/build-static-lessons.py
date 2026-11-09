#!/usr/bin/env python3
"""Generate static, JavaScript-free HTML pages for every lesson and resource.

Atlas itself is a single-page app: its real content (content/*.json) is
fetched and rendered by js/*.js, so a crawler that doesn't run JavaScript
(including most AI browsing tools) only ever sees the empty shell in
index.html. This script reads the same content packs the app reads and
writes plain HTML mirrors under static/, with real <a> links between them,
so that content is readable without executing anything.

Re-run this after editing any file in content/, then commit the output
under static/. There is no build step for the app itself; this is a
separate, occasional maintenance script, not part of the runtime.

Usage: python3 scripts/build-static-lessons.py
"""
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTENT = ROOT / "content"
OUT = ROOT / "static"

LEVEL_LABELS = {"basics": "Basics", "intermediate": "Intermediate", "advanced": "Advanced"}

PAGE_CSS = """
body{font:16px/1.55 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:780px;margin:0 auto;padding:24px 20px 80px;color:#1b1f23;background:#fff}
a{color:#2b5a87}
h1{font-size:1.6rem;margin-bottom:.2em}
h2{font-size:1.15rem;margin-top:2em}
.eyebrow{color:#5b6572;font-size:.9rem;margin:0 0 1.2em}
.banner{background:#f0f4f8;border:1px solid #d7e1ea;border-radius:8px;padding:12px 16px;font-size:.92rem;margin-bottom:1.6em}
ul{padding-left:1.3em}
li{margin-bottom:.5em}
.step{border-top:1px solid #e6e9ec;padding:.8em 0}
.step__min{color:#5b6572;font-size:.85rem}
table{border-collapse:collapse;width:100%;margin:1em 0}
td,th{border-bottom:1px solid #e6e9ec;padding:.4em .6em;text-align:left;font-size:.95rem}
nav.top a{margin-right:1em}
footer{margin-top:3em;color:#5b6572;font-size:.85rem}
"""


def esc(value):
    return html.escape(str(value), quote=True)


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def load_manifest():
    return load_json(CONTENT / "manifest.json")


def load_lessons(manifest):
    lessons = []
    for pack in manifest["packs"]:
        if pack["type"] != "lessons":
            continue
        data = load_json(CONTENT / pack["path"])
        lessons.extend(data["lessons"])
    lessons.sort(key=lambda l: (l["day"], l.get("part", 1)))
    return lessons


def load_pathways(manifest):
    pathways = []
    for pack in manifest["packs"]:
        if pack["type"] != "pathway":
            continue
        data = load_json(CONTENT / pack["path"])
        if data["pathway"].get("retired"):
            continue
        p = dict(data["pathway"])
        p["lessons"] = sorted(data.get("lessons", []), key=lambda l: l["order"])
        p.setdefault("coreDays", [])
        pathways.append(p)
    pathways.sort(key=lambda p: p["order"])
    return pathways


def load_retired(manifest):
    """{old lesson id: id of the lesson it was folded into}, from every lessons pack's "retired" list."""
    moved = {}
    for pack in manifest["packs"]:
        if pack["type"] == "lessons":
            for r in load_json(CONTENT / pack["path"]).get("retired", []):
                moved[r["id"]] = r["into"]
    return moved


def redirect_page(target, title):
    """A page left at an old address so links to it keep working."""
    return f"""<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<title>Moved: {esc(title)} · Atlas</title>
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="{esc(target)}">
<meta http-equiv="refresh" content="0; url={esc(target)}">
</head>
<body>
<p>This lesson is now part of <a href="{esc(target)}">{esc(title)}</a>.</p>
</body>
</html>
"""


def day_slug(lesson):
    return f"day-{lesson['day']:02d}-{lesson['id']}"


def load_resources(manifest):
    by_id = {}
    for pack in manifest["packs"]:
        if pack["type"] != "resources":
            continue
        data = load_json(CONTENT / pack["path"])
        for res in data["resources"]:
            by_id[res["id"]] = res
    return by_id


def page_shell(title, eyebrow, body_html, back_href="index.html", root="../../"):
    """`root` is the relative path from this page to the site root (where the app's index.html is)."""
    return f"""<!doctype html>
<html lang="en-CA">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · Atlas</title>
<meta name="robots" content="index,follow">
<style>{PAGE_CSS}</style>
</head>
<body>
<nav class="top"><a href="{root}static/index.html">Course mirror home</a><a href="{root}static/lessons/index.html">All lessons</a><a href="{root}static/pathways/index.html">Pathways</a><a href="{root}index.html">Open Atlas (interactive)</a></nav>
<div class="banner">This is a plain-text mirror of Atlas's course content, generated for search engines and AI tools that can't run the app's JavaScript. For the real, interactive course — progress tracking, flashcards, offline use — <a href="{root}index.html">open Atlas</a>.</div>
{f'<p class="eyebrow">{eyebrow}</p>' if eyebrow else ""}
{body_html}
<footer><a href="{back_href}">&larr; Back</a></footer>
</body>
</html>
"""


def list_block(items):
    if not items:
        return ""
    return "<ul>" + "".join(f"<li>{esc(i)}</li>" for i in items) + "</ul>"


def lesson_body(lesson, resources, pathway=None, day_pathway=None):
    level = LEVEL_LABELS.get(lesson.get("level"), lesson.get("level", ""))
    if pathway:
        place = f"Pathway: {esc(pathway['title'])} · Lesson {lesson['order']}"
        app_href = f"../../index.html#path/{pathway['id']}/{lesson['order']}"
    else:
        part = lesson.get("part", 1)
        place = f"Day {lesson['day']}{f' · lesson {part}' if part > 1 else ''} · Week {lesson['week']}"
        if day_pathway:
            place += f" · Part of the {esc(day_pathway['title'])} pathway"
        app_href = f"../../index.html#lesson/{lesson['day']}{f'/{part}' if part > 1 else ''}"
    eyebrow = f"{place} · {esc(level)} · about {lesson.get('plannedMinutes', '?')} min"

    words_html = ""
    if lesson.get("words"):
        rows = "".join(
            f"<tr><td><strong>{esc(w['term'])}</strong></td><td>{esc(w['meaning'])}</td></tr>"
            for w in lesson["words"]
        )
        words_html = f"<h2>Key terms</h2><table>{rows}</table>"

    steps_html = ""
    if lesson.get("steps"):
        rows = []
        for step in lesson["steps"]:
            res = resources.get(step.get("resourceId")) if step.get("resourceId") else None
            link = f' &mdash; <a href="{esc(res["url"])}">{esc(res["title"])}</a> ({esc(res.get("source",""))})' if res else ""
            minutes = f'<span class="step__min">{step.get("minutes","?")} min</span>' if step.get("minutes") is not None else ""
            rows.append(f'<div class="step"><p>{esc(step["text"])}{link}</p>{minutes}</div>')
        steps_html = "<h2>Today's steps</h2>" + "".join(rows)

    check_html = f"<h2>Check yourself</h2>{list_block(lesson.get('checkYourself'))}" if lesson.get("checkYourself") else ""
    lookfor_html = f"<h2>What a good answer looks like</h2>{list_block(lesson.get('lookFor'))}" if lesson.get("lookFor") else ""
    skip_html = f"<h2>Skip or skim</h2><p>{esc(lesson['skipOrSkim'])}</p>" if lesson.get("skipOrSkim") else ""

    app_link = f'<p><a href="{app_href}">Open this lesson in Atlas &rarr;</a></p>'

    return f"""<h1>{esc(lesson['title'])}</h1>
<p class="eyebrow">{eyebrow}</p>
<p>{esc(lesson['inOneSentence'])}</p>
<p><strong>By the end, you can:</strong> {esc(lesson['youCanNow'])}</p>
<h2>Why it matters to a designer</h2>
<p>{esc(lesson['whyItMattersToADesigner'])}</p>
<h2>Key ideas</h2>
{list_block(lesson.get('keyIdeas'))}
{words_html}
{steps_html}
{skip_html}
{check_html}
{lookfor_html}
{app_link}
"""


def resource_rows(resources):
    rows = []
    for res in sorted(resources.values(), key=lambda r: r["title"].lower()):
        optional = " · optional" if res.get("optional") else ""
        rows.append(
            f'<tr><td><a href="{esc(res["url"])}">{esc(res["title"])}</a></td>'
            f'<td>{esc(res.get("source",""))}</td>'
            f'<td>{esc(res.get("type",""))}{optional}</td>'
            f'<td>{esc(res.get("estimatedMinutes","?"))} min</td></tr>'
        )
    return "".join(rows)


SECPLUS_TOKENS = "<style>:root{--text:#1c1d1f;--muted:#595d64;--surface:#fffefb;--surface-2:#efece5;--accent:#2b5a87;--accent-soft:#e5ecf3;--line-strong:rgb(28 29 31 / .2);--line:rgb(28 29 31 / .12);--accent-text:#ffffff;--success:#1f6b3a;--success-soft:#e3efe6;--warn-bg:#fbf0d3;--warn-text:#563a00;--warn-border:#b07800;--danger:#a3261c;--danger-soft:#f8e7e4}svg{width:100%;height:auto}figure.art{margin:1.2em 0;padding:16px 12px;border-radius:10px;background:var(--surface-2)}figure.art svg{display:block;max-width:460px;margin:0 auto}pre{background:#f0f4f8;padding:10px;overflow-x:auto}details{margin:.4em 0}</style>"


def secplus_table(t):
    head = "".join(f"<th>{esc(c)}</th>" for c in t["cols"])
    rows = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in t["rows"])
    return f"<table><caption>{esc(t['caption'])}</caption><tr>{head}</tr>{rows}</table>"


def secplus_question(q, n):
    pre = f"<pre>{esc(chr(10).join(q['pre']))}</pre>" if q.get("pre") else ""
    if q.get("a"):
        opts = "".join(f"<li>{esc(a['t'])}</li>" for a in q["a"])
        why = "".join(f"<li><strong>{'Correct' if a['ok'] else 'Incorrect'}:</strong> {esc(a['t'])}. {esc(a['w'])}</li>" for a in q["a"])
        body = f"<ul>{opts}</ul><details><summary>Answer and explanation</summary><ul>{why}</ul></details>"
    elif q.get("seq"):
        steps = "".join(f"<li>{esc(x)}</li>" for x in q["seq"])
        body = f"<details><summary>Correct order</summary><ol>{steps}</ol><p>{esc(q.get('why',''))}</p></details>"
    else:
        pairs = "".join(f"<li>{esc(a)}: {esc(b)}</li>" for a, b in q["pairs"])
        body = f"<details><summary>Correct matches</summary><ul>{pairs}</ul><p>{esc(q.get('why',''))}</p></details>"
    return f"<div class=\"step\"><p><strong>{n}.</strong> {esc(q['s'])}</p>{pre}{body}</div>"


SECPLUS_RELEVANCE = {"direct": "Direct product design relevance", "professional": "Professional relevance for cross-functional work", "foundation": "Foundational technical knowledge"}


def secplus_exercise(ex, bullets):
    """The eight-part design brief as plain HTML."""
    return (f"<h3>Design brief: {esc(ex['title'])}</h3><p class=\"eyebrow\">About {ex['min']} min</p>"
            f"<p><strong>Scenario:</strong> {esc(ex['scenario'])}</p><p><strong>Problem statement:</strong> {esc(ex['problem'])}</p>"
            f"<p><strong>Your design task:</strong></p>{bullets(ex['tasks'])}<p><strong>Technical security constraints:</strong></p>{bullets(ex['constraints'])}"
            f"<p><strong>User needs:</strong></p>{bullets(ex['needs'])}<p><strong>Expected deliverable:</strong> {esc(ex['deliver'])}</p>"
            f"<p><strong>Evaluation criteria:</strong></p>{bullets([c['t'] for c in ex['crit']])}<p><strong>Senior-level considerations:</strong></p>{bullets(ex['seniors'])}"
            "<p>A design review is not a security sign-off. Have security engineers confirm technical decisions.</p>")


def secplus_design(d, bullets, para):
    asks = "".join(f"<p><strong>{name}:</strong></p>{bullets(d['asks'][key])}" for key, name in (("eng", "Engineering"), ("sec", "Security"), ("prod", "Product")) if d["asks"][key])
    asks = f"<h3>Questions a Senior Product Designer should ask</h3>{asks}" if asks else ""
    if "ex" not in d:
        return f"<p><strong>No design exercise here, on purpose.</strong> {esc(d['noex'])}</p>{asks}", ""
    critique = "<h3>B. Product design assessment</h3><p>Rate your work in the interactive app, where it counts toward design competency only.</p>" + "".join(secplus_question(q, i + 1) for i, q in enumerate(d["ex"]["cq"]))
    return secplus_exercise(d["ex"], bullets) + asks, critique


def build_secplus():
    """The Security+ pathway as plain pages under static/secplus/. Mock exams and PBQs stay in the interactive app."""
    index_path = CONTENT / "secplus-index.json"
    if not index_path.exists():
        return []
    ix = load_json(index_path)
    diagrams = load_json(CONTENT / "secplus-diagrams.json")
    refs = {r["id"]: r for r in ix["references"]}
    out_dir = OUT / "secplus"
    out_dir.mkdir(parents=True, exist_ok=True)
    notice = '<div class="banner">Independent of CompTIA. Lessons, design briefs and practice questions here were written with an AI model and are not actual exam questions. CompTIA says it does not authorize AI-generated study questions or practice exams: <a href="https://www.comptia.org/en/resources/test-policies/unauthorized-training-materials/">read its policy</a> before relying on this material.</div>'
    urls = ["static/secplus/index.html"]
    week_html = []
    for w in ix["weeks"]:
        rows = []
        for s in w["sessions"]:
            if s["type"] != "lesson":
                rows.append(f"<tr><td></td><td>{esc(s['title'])} (interactive app)</td><td>{s['min']} min</td></tr>")
                continue
            doc = load_json(CONTENT / f"secplus-w{w['n']:02d}.json")
            l = next(x for x in doc["lessons"] if x["id"] == s["id"])
            label = f"Objective {', '.join(l['obj'])}" if l["obj"] else "Foundation (not an exam objective)"
            nav_next = f'<p><a href="{esc(l["next"])}.html">Next lesson &rarr;</a></p>' if l["next"] else ""
            para = lambda items: "".join(f"<p>{esc(x)}</p>" for x in items)
            bullets = lambda items: "<ul>" + "".join(f"<li>{esc(x)}</li>" for x in items) + "</ul>"
            figure = lambda d: (f"<figure class=\"art\" role=\"img\" aria-label=\"{esc(d['alt'])}\">{d['svg']}</figure>" if d.get("art") else d["svg"]) + f"<p class=\"eyebrow\">{esc(d['caption'])}</p>"
            blocks = "".join(figure(diagrams[b["diagram"]]) if "diagram" in b else secplus_table(b["table"]) for b in l["blocks"])
            terms = "<table>" + "".join(f"<tr><td><strong>{esc(t)}</strong></td><td>{esc(d)}</td></tr>" for t, d in l["terms"]) + "</table>"
            walks = "".join(f"<h2>Walkthrough: {esc(x['title'])}</h2><ol>" + "".join(f"<li>{esc(y)}</li>" for y in x["steps"]) + "</ol>" for x in l["walks"])
            labs = "".join(f"<h3>{esc(x['title'])}</h3><p class=\"eyebrow\">About {x['min']} min. {esc(x['tool'])}</p><ol>" + "".join(f"<li>{esc(y)}</li>" for y in x["do"]) + f"</ol><p><strong>Expected:</strong> {esc(x['expect'])}</p><p>{esc(x['explain'])}</p><p><strong>Done when:</strong></p>{bullets(x['pass'])}" for x in l["labs"])
            qs = "".join(secplus_question(q, i + 1) for i, q in enumerate(l["qs"]))
            ref_rows = "".join(f'<li><a href="{esc(refs[r["id"]]["url"])}">{esc(refs[r["id"]]["title"])}</a> ({esc(refs[r["id"]]["org"])}, {"required" if r["req"] else "supplementary"})</li>' for r in l["refs"])
            cards = "".join(f"<details><summary>{esc(f)}</summary><p>{esc(b)}</p></details>" for f, b in l["cards"])
            d = l["design"]
            design_html, critique_html = secplus_design(d, bullets, para)
            body = f"""{SECPLUS_TOKENS}{notice}<h1>{esc(l['title'])}</h1>
<p class="eyebrow">Lesson {l['n']} · Week {w['n']} · {esc(l.get('domain',''))} · {esc(label)} · {esc(l['level'])} · about {l['min']} min</p>
<p><a href="../../index.html#cert/lesson/{esc(l['id'])}">Open this lesson in Atlas &rarr;</a></p>
<p class="eyebrow">{esc(SECPLUS_RELEVANCE[d['rel']])}</p>
<h2>1. Learn the concept</h2><h3>By the end, you can</h3>{bullets(l['out'])}<h3>Why it exists and what problem it solves</h3><p>{esc(l['why'])}</p><h3>In plain language</h3>{para(l['plain'])}
<h2>2. Technical deep dive</h2>{para(l['tech'])}{blocks}<h3>Key terms</h3>{terms}{walks}<h3>Hands-on lab</h3>{labs}
<h2>3. See it in real products</h2>{para(d['product'])}<h3>In security operations</h3>{bullets(l['eg'])}
<h2>4. Apply it as a Product Designer</h2>{design_html}
<h2>5. Test your understanding</h2><h3>A. Security+ technical assessment</h3><p><strong>Exam-style scenario:</strong> {esc(l['scenario'])}</p><details><summary>Compare your reasoning</summary><p>{esc(l['answer'])}</p></details>{qs}{critique_html}
<h2>6. Review and references</h2><h3>Common mistakes</h3>{bullets(l['mistakes'])}<h3>Summary</h3>{bullets(l['sum'])}<h3>References</h3><ul>{ref_rows}</ul><h3>Flashcards</h3>{cards}{nav_next}"""
            (out_dir / f"{l['id']}.html").write_text(page_shell(l["title"], "", body, back_href="index.html"), encoding="utf-8")
            urls.append(f"static/secplus/{l['id']}.html")
            rows.append(f'<tr><td>{l["n"]}</td><td><a href="{esc(l["id"])}.html">{esc(l["title"])}</a></td><td>{l["min"]} min</td></tr>')
        week_html.append(f"<h3>Week {w['n']}: {esc(w['title'])}</h3><p>{esc(w['outcome'])}</p><table>{''.join(rows)}</table>")
    bullets = lambda items: "<ul>" + "".join(f"<li>{esc(x)}</li>" for x in items) + "</ul>"
    case_rows = []
    for k in load_json(CONTENT / "secplus-cases.json")["cases"]:
        crit = "".join(secplus_question(q, i + 1) for i, q in enumerate(k["ex"]["cq"]))
        body = f"""{SECPLUS_TOKENS}{notice}<h1>{esc(k['ex']['title'])}</h1><p class="eyebrow">Integrated case study · Week {k['week']} · {esc(k['sector'])} · about {k['ex']['min']} min</p>
<p><a href="../../index.html#cert/case/{esc(k['id'])}">Open this case study in Atlas &rarr;</a></p><h2>Technical half</h2>{bullets([p['t'] for p in k['practice']])}<h2>Design half</h2>{secplus_exercise(k['ex'], bullets)}<h2>Design critique</h2>{crit}"""
        (out_dir / f"{k['id']}.html").write_text(page_shell(k["ex"]["title"], "", body, back_href="index.html"), encoding="utf-8")
        urls.append(f"static/secplus/{k['id']}.html")
        case_rows.append(f'<tr><td>Week {k["week"]}</td><td><a href="{esc(k["id"])}.html">{esc(k["ex"]["title"])}</a></td><td>{k["ex"]["min"]} min</td></tr>')
    week_html.append(f"<h3>Integrated case studies</h3><table>{''.join(case_rows)}</table>")
    domains = "".join(f"<tr><td>{d}.0 {esc(v['name'])}</td><td>{v['weight']}%</td></tr>" for d, v in ix["domains"].items())
    objectives = "".join(f"<tr><td>{esc(o['id'])}</td><td>{esc(o['title'])}</td><td>" + ", ".join(f'<a href="{esc(x)}.html">{esc(x)}</a>' for x in o["lessons"]) + "</td></tr>" for o in ix["objectives"])
    used = sorted((r for r in ix["references"] if r["lessons"]), key=lambda r: r["title"].lower())
    library = "".join(f'<tr><td><a href="{esc(r["url"])}">{esc(r["title"])}</a></td><td>{esc(r["org"])}</td><td>{esc(r["type"])}</td><td>{r["minutes"]} min</td><td>{"Required" if r["required"] else "Supplementary"}</td><td>{esc(r["access"])}</td></tr>' for r in used)
    objectives_url = refs["comptia-objectives"]["url"]
    index_body = f"""{notice}<h1>Security+ for Product Designers — CompTIA SY0-801</h1>
<p>One 16-week self-paced pathway with two outcomes: readiness for the Security+ exam and the ability to apply security knowledge as a Senior Product Designer. It has four weeks of IT and networking foundations, nine weeks across the five exam domains, and three weeks of revision and integrated case studies. Design exercises sit inside the lessons where the concept has a real design application. Mock exams, performance-based practice and progress tracking are in <a href="../../index.html#cert">the interactive app</a>. Objective numbers are shown with short names in Atlas's own words. The exact wording is in <a href="{esc(objectives_url)}">CompTIA's objectives document</a>.</p>
<h2>Exam domains</h2><table>{domains}</table><h2>Objectives and lessons</h2><table><tr><th>Objective</th><th>Topic</th><th>Lessons</th></tr>{objectives}</table>
<h2>Curriculum</h2>{''.join(week_html)}<h2>References</h2><table><tr><th>Title</th><th>From</th><th>Type</th><th>Time</th><th>Use</th><th>Access</th></tr>{library}</table>"""
    (out_dir / "index.html").write_text(page_shell("Security+ for Product Designers", "", index_body, back_href="../pathways/index.html"), encoding="utf-8")
    return urls


def build():
    manifest = load_manifest()
    lessons = load_lessons(manifest)
    resources = load_resources(manifest)
    pathways = load_pathways(manifest)
    pathway_for_day = {d: p for p in pathways for d in p["coreDays"]}
    lesson_for_day = {l["day"]: l for l in lessons}
    lesson_by_id = {l["id"]: l for l in lessons}
    moved = load_retired(manifest)

    lessons_dir = OUT / "lessons"
    lessons_dir.mkdir(parents=True, exist_ok=True)

    index_rows = []
    for lesson in lessons:
        slug = day_slug(lesson)
        page = page_shell(
            lesson["title"],
            "",
            lesson_body(lesson, resources, day_pathway=pathway_for_day.get(lesson["day"])),
            back_href="index.html",
        )
        (lessons_dir / f"{slug}.html").write_text(page, encoding="utf-8")
        level = LEVEL_LABELS.get(lesson.get("level"), lesson.get("level", ""))
        index_rows.append(
            f'<tr><td>{lesson["day"]}</td><td>{lesson["week"]}</td>'
            f'<td><a href="{slug}.html">{esc(lesson["title"])}</a></td>'
            f'<td>{esc(level)}</td></tr>'
        )

    lessons_index_body = f"""<h1>All lessons</h1>
<p>{len(lessons)} lessons from the 60-day core of Atlas, a product-design learning platform for security. Each page below has the full lesson: a measurable objective, key ideas, key terms, timed steps with references, and check-yourself questions with example answers. Security foundations (what security protects, risk, controls, how apps and APIs work, protecting data, application security and threat modelling) are taught inside the Week 1 and 2 lessons that rely on them. Self-paced pathways are listed on the <a href="../pathways/index.html">pathways page</a>.</p>
<table><tr><th>Day</th><th>Week</th><th>Lesson</th><th>Level</th></tr>{"".join(index_rows)}</table>
<p><a href="../resources/index.html">All references used in these lessons &rarr;</a></p>
"""
    (lessons_dir / "index.html").write_text(
        page_shell("All lessons", "", lessons_index_body, back_href="../index.html"),
        encoding="utf-8",
    )

    pathways_dir = OUT / "pathways"
    pathways_dir.mkdir(parents=True, exist_ok=True)
    for old in pathways_dir.glob("*.html"):
        old.unlink()  # a retired pathway's pages must not linger
    pathway_names = ", ".join(p["title"] for p in pathways)
    pathway_sections = []
    pathway_lesson_count = 0
    pathway_urls = []
    for p in pathways:
        rows = []
        for l in p["lessons"]:
            slug = l["id"]
            (pathways_dir / f"{slug}.html").write_text(
                page_shell(l["title"], "", lesson_body(l, resources, pathway=p), back_href="index.html"),
                encoding="utf-8",
            )
            pathway_lesson_count += 1
            pathway_urls.append(f"static/pathways/{slug}.html")
            level = LEVEL_LABELS.get(l.get("level"), l.get("level", ""))
            rows.append(f'<tr><td>{l["order"]}</td><td><a href="{slug}.html">{esc(l["title"])}</a></td><td>{esc(level)}</td></tr>')
        days = []
        for d in p["coreDays"]:
            dl = lesson_for_day.get(d)
            if dl:
                days.append(f'<tr><td>Day {d}</td><td><a href="../lessons/{day_slug(dl)}.html">{esc(dl["title"])}</a></td><td>{esc(LEVEL_LABELS.get(dl.get("level"), ""))}</td></tr>')
        own = f'<h3>Pathway lessons</h3><table><tr><th>#</th><th>Lesson</th><th>Level</th></tr>{"".join(rows)}</table>' if rows else ""
        cal = f'<h3>In the 60-day calendar</h3><table><tr><th>Day</th><th>Lesson</th><th>Level</th></tr>{"".join(days)}</table>' if days else ""
        pathway_sections.append(f"""<h2 id="{esc(p['id'])}">{esc(p['title'])}</h2>
<p>{esc(p['summary'])}</p>
<p><strong>For:</strong> {esc(p['forWho'])}</p>
{own}
{cal}""")
    # Old addresses of lessons that were folded into a day keep working.
    redirects = 0
    for old_id, into in moved.items():
        target = lesson_by_id[into]
        slug = day_slug(target)
        (pathways_dir / f"{old_id}.html").write_text(redirect_page(f"../lessons/{slug}.html", target["title"]), encoding="utf-8")
        redirects += 1
        for old in lessons_dir.glob(f"day-*-{old_id}.html"):
            old.write_text(redirect_page(f"{slug}.html", target["title"]), encoding="utf-8")
            redirects += 1

    secplus_urls = build_secplus()
    pathway_urls += secplus_urls
    pathways_body = f"""<h1>Pathways</h1>
<p>Choose what you want to study. Each pathway keeps its own progress in the interactive app.</p>
<h2 id="core-60">60-Day Identity and Security Course</h2>
<p>The full calendar: a lesson for every study day, from security foundations through identity, networks, zero trust, sign-in, Kubernetes, incident response and governance, with hands-on exercises and two portfolio case studies.</p>
<p><a href="../lessons/index.html">Open all {len(lessons)} lessons &rarr;</a></p>
{"".join(pathway_sections)}
<p><a href="../secplus/index.html">Open the full Security+ for Product Designers mirror &rarr;</a></p>
"""
    (pathways_dir / "index.html").write_text(
        page_shell("Pathways", "", pathways_body, back_href="../index.html"),
        encoding="utf-8",
    )

    resources_dir = OUT / "resources"
    resources_dir.mkdir(parents=True, exist_ok=True)
    resources_body = f"""<h1>All references</h1>
<p>{len(resources)} references used across the course, from primary sources such as Kubernetes, Calico, Tailscale, NIST, OWASP, CISA, MITRE and the Nielsen Norman Group.</p>
<table><tr><th>Title</th><th>Source</th><th>Type</th><th>Length</th></tr>{resource_rows(resources)}</table>
"""
    (resources_dir / "index.html").write_text(
        page_shell("All references", "", resources_body, back_href="../index.html"),
        encoding="utf-8",
    )

    top_index_body = f"""<h1>Atlas: plain-text course mirror</h1>
<p>Atlas is a product-design learning platform for security: a 60-day core course (security foundations, then a strong identity and access pathway), plus self-paced pathways. The interactive app at <a href="../index.html">marva-a.github.io/atlas</a> needs JavaScript; this is a static mirror of the same course content for search engines and AI tools that can't run it.</p>
<ul>
<li><a href="lessons/index.html">All {len(lessons)} core lessons</a> — objectives, key ideas, key terms, steps, exercises and check-yourself questions</li>
<li><a href="pathways/index.html">{len(pathways)} pathways</a> — {esc(pathway_names)}</li>
<li><a href="resources/index.html">All {len(resources)} references</a> — the primary sources each lesson draws on</li>
</ul>
"""
    (OUT / "index.html").write_text(
        page_shell("Atlas course content", "", top_index_body, back_href="../index.html", root="../"),
        encoding="utf-8",
    )

    # sitemap.xml at the repo root, covering every static page plus the app itself.
    base = "https://marva-a.github.io/atlas"
    urls = [f"{base}/", f"{base}/static/index.html", f"{base}/static/lessons/index.html", f"{base}/static/pathways/index.html", f"{base}/static/resources/index.html"]
    urls += [f"{base}/{u}" for u in pathway_urls]
    for lesson in lessons:
        slug = day_slug(lesson)
        urls.append(f"{base}/static/lessons/{slug}.html")
    sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        sitemap.append(f"<url><loc>{esc(u)}</loc></url>")
    sitemap.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    print(f"Wrote {len(lessons)} lesson pages, {pathway_lesson_count} pathway lesson pages, {redirects} redirects for moved lessons, {len(resources)} resources, and sitemap.xml with {len(urls)} URLs.")


if __name__ == "__main__":
    build()
