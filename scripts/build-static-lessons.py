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

    pathways_body = f"""<h1>Pathways</h1>
<p>The 60-day calendar is Atlas's core: security foundations, identity, access, zero trust, sign-in and governance. Pathways are focused tracks beside it, to go deeper in one area alongside the calendar or after it.</p>
{"".join(pathway_sections)}
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
