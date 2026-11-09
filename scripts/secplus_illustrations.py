"""Illustrations for the Security+ pathway's harder concepts.

Each one is inline SVG drawn with Atlas's colour tokens, so it follows light and dark mode. They are
narrow (360 units wide) and read top to bottom, so the words stay readable on a phone.
scripts/build-secplus-diagrams.py imports ILLUSTRATIONS and writes them with the older diagrams.

Every piece of text is measured roughly as it is added; a line that would run outside the picture
stops the build with the name of the illustration.
"""
from html import escape

W = 360
T, M, A, AS = "var(--text)", "var(--muted)", "var(--accent)", "var(--accent-soft)"
S, S2, L, LN = "var(--surface)", "var(--surface-2)", "var(--line-strong)", "var(--line)"
OK, OKS, BAD, BADS = "var(--success)", "var(--success-soft)", "var(--danger)", "var(--danger-soft)"
WB, WBR, WT = "var(--warn-bg)", "var(--warn-border)", "var(--warn-text)"
SANS = "system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
MONO = "ui-monospace,SF Mono,Menlo,Consolas,monospace"
MARK = {M: "im", A: "ia", OK: "ig", BAD: "ib", T: "it"}
DEFS = "<defs>" + "".join(
    f'<marker id="{i}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="{c}"/></marker>'
    for c, i in MARK.items()) + "</defs>"

_current = "?"
PROBLEMS = []


def _fits(x, s, size, anchor, mono, weight):
    width = len(s) * size * (0.61 if mono else 0.57 if weight >= 600 else 0.53)
    left = x - width / 2 if anchor == "middle" else x - width if anchor == "end" else x
    if left < 2 or left + width > W - 2:
        PROBLEMS.append(f"{_current}: text runs outside the picture: {s!r} ({left:.0f} to {left + width:.0f})")


def t(x, y, s, size=12, weight=400, anchor="middle", fill=T, mono=False):
    _fits(x, s, size, anchor, mono, weight)
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{fill}" font-family="{MONO if mono else SANS}">{escape(s)}</text>'


def tl(x, y, rows, size=12, weight=400, anchor="middle", fill=T, lh=None, mono=False):
    """Several lines of text, the first at y."""
    lh = lh or round(size * 1.3)
    return "".join(t(x, y + i * lh, r, size, weight, anchor, fill, mono) for i, r in enumerate(rows))


def rect(x, y, w, h, fill=S, stroke=L, rx=10, sw=1.5, dash=None):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"{d}/>'


def line(x1, y1, x2, y2, c=M, sw=1.6, dash=None, head=True, both=False):
    d = f' stroke-dasharray="{dash}"' if dash else ""
    m = f' marker-end="url(#{MARK[c]})"' if head else ""
    if both:
        m += f' marker-start="url(#{MARK[c]})"'
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="{sw}" stroke-linecap="round"{d}{m}/>'


def path(d, stroke=T, fill="none", sw=1.7, dash=None):
    dd = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{dd}/>'


def circle(cx, cy, r, fill=S, stroke=T, sw=1.7):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>'


def chip(cx, cy, s, fill=AS, color=T, size=11, weight=600, mono=False, pad=8, stroke="none"):
    w = len(s) * size * (0.61 if mono else 0.58) + pad * 2
    return rect(cx - w / 2, cy - size * 0.95, w, size * 1.9, fill, stroke, rx=size * 0.95, sw=1) + t(cx, cy + size * 0.36, s, size, weight, "middle", color, mono)


def badge(cx, cy, n, c=A):
    return f'<circle cx="{cx}" cy="{cy}" r="9" fill="{c}"/>' + f'<text x="{cx}" y="{cy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="var(--accent-text)" font-family="{SANS}">{n}</text>'


def tick(cx, cy, c=OK, r=8):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>' + f'<path d="M{cx - r * .45} {cy + r * .02}l{r * .32} {r * .34}l{r * .6} -{r * .68}" fill="none" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'


def cross(cx, cy, c=BAD, r=8):
    k = r * .38
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{c}"/>' + f'<path d="M{cx - k} {cy - k}L{cx + k} {cy + k}M{cx + k} {cy - k}L{cx - k} {cy + k}" stroke="var(--surface)" stroke-width="1.8" stroke-linecap="round"/>'


# ─── Icons, each centred on (cx, cy) and about 40 units across ────────────────

def laptop(cx, cy, c=T, fill=S):
    return rect(cx - 16, cy - 14, 32, 21, fill, c, rx=3, sw=1.7) + path(f"M{cx - 22} {cy + 11}H{cx + 22}L{cx + 19} {cy + 15}H{cx - 19}Z", c, fill)


def phone(cx, cy, c=T, fill=S):
    return rect(cx - 9, cy - 16, 18, 32, fill, c, rx=4, sw=1.7) + line(cx - 3, cy + 11, cx + 3, cy + 11, c, 1.7, head=False)


def server(cx, cy, c=T, fill=S):
    out = rect(cx - 15, cy - 18, 30, 36, fill, c, rx=4, sw=1.7)
    for dy in (-6, 6):
        out += line(cx - 15, cy + dy, cx + 15, cy + dy, c, 1.4, head=False)
    for dy in (-12, 0, 12):
        out += f'<circle cx="{cx - 8}" cy="{cy + dy}" r="1.8" fill="{c}"/>'
    return out


def db(cx, cy, c=T, fill=S):
    return (path(f"M{cx - 15} {cy - 11}V{cy + 11}A15 5.5 0 0 0 {cx + 15} {cy + 11}V{cy - 11}", c, fill)
            + f'<ellipse cx="{cx}" cy="{cy - 11}" rx="15" ry="5.5" fill="{fill}" stroke="{c}" stroke-width="1.7"/>'
            + path(f"M{cx - 15} {cy}A15 5.5 0 0 0 {cx + 15} {cy}", c))


def cloud(cx, cy, c=T, fill=S):
    return path(f"M{cx - 14} {cy + 11}H{cx + 13}A9 9 0 0 0 {cx + 15} {cy - 6.8}A12 12 0 0 0 {cx - 8} {cy - 9}A10.5 10.5 0 0 0 {cx - 14} {cy + 11}Z", c, fill)


def person(cx, cy, c=T, fill=S):
    return circle(cx, cy - 9, 6.5, fill, c) + path(f"M{cx - 12} {cy + 14}A12 11 0 0 1 {cx + 12} {cy + 14}Z", c, fill)


def lock(cx, cy, c=T, fill=S, opened=False):
    shackle = f"M{cx - 6} {cy - 3}V{cy - 8}A6 6 0 0 1 {cx + 6} {cy - 8}" + ("" if opened else f"V{cy - 3}")
    return path(shackle, c) + rect(cx - 9, cy - 3, 18, 14, fill, c, rx=3, sw=1.7) + f'<circle cx="{cx}" cy="{cy + 4}" r="1.9" fill="{c}"/>'


def key(cx, cy, c=T, fill=S):
    return circle(cx - 8, cy, 5, fill, c) + path(f"M{cx - 3} {cy}H{cx + 13}M{cx + 7} {cy}V{cy + 5}M{cx + 12} {cy}V{cy + 4}", c)


def doc(cx, cy, c=T, fill=S):
    return (path(f"M{cx - 11} {cy - 14}H{cx + 5}L{cx + 11} {cy - 8}V{cy + 14}H{cx - 11}Z", c, fill)
            + path(f"M{cx - 6} {cy - 3}H{cx + 6}M{cx - 6} {cy + 2}H{cx + 6}M{cx - 6} {cy + 7}H{cx + 2}", c, sw=1.4))


def envelope(cx, cy, c=T, fill=S):
    return rect(cx - 16, cy - 11, 32, 22, fill, c, rx=3, sw=1.7) + path(f"M{cx - 15} {cy - 9}L{cx} {cy + 2}L{cx + 15} {cy - 9}", c)


def shield(cx, cy, c=T, fill=S):
    return path(f"M{cx} {cy - 16}L{cx + 13} {cy - 11}V{cy - 2}C{cx + 13} {cy + 7} {cx + 7} {cy + 13} {cx} {cy + 16}C{cx - 7} {cy + 13} {cx - 13} {cy + 7} {cx - 13} {cy - 2}V{cy - 11}Z", c, fill)


def router(cx, cy, c=T, fill=S):
    out = path(f"M{cx - 10} {cy - 3}L{cx - 14} {cy - 15}M{cx + 10} {cy - 3}L{cx + 14} {cy - 15}", c) + rect(cx - 19, cy - 3, 38, 15, fill, c, rx=4, sw=1.7)
    for dx in (-10, -4, 2):
        out += f'<circle cx="{cx + dx}" cy="{cy + 4.5}" r="1.6" fill="{c}"/>'
    return out


def wifi(cx, cy, c=T):
    return path(f"M{cx - 14} {cy - 4}A20 20 0 0 1 {cx + 14} {cy - 4}M{cx - 8} {cy + 2}A12 12 0 0 1 {cx + 8} {cy + 2}", c, sw=2) + f'<circle cx="{cx}" cy="{cy + 9}" r="2.6" fill="{c}"/>'


def card(cx, cy, c=T, fill=S):
    return rect(cx - 18, cy - 12, 36, 24, fill, c, rx=4, sw=1.7) + line(cx - 18, cy - 4, cx + 18, cy - 4, c, 3, head=False) + line(cx - 12, cy + 5, cx - 2, cy + 5, c, 1.6, head=False)


def bell(cx, cy, c=T, fill=S):
    return path(f"M{cx - 10} {cy + 7}C{cx - 6} {cy + 2} {cx - 8} {cy - 12} {cx} {cy - 12}C{cx + 8} {cy - 12} {cx + 6} {cy + 2} {cx + 10} {cy + 7}Z", c, fill) + path(f"M{cx - 3} {cy + 11}A3 3 0 0 0 {cx + 3} {cy + 11}", c)


def node(icon, cx, cy, label, sub=None, c=T, size=12):
    out = icon(cx, cy, c) + t(cx, cy + 34, label, size, 600)
    if sub:
        out += t(cx, cy + 34 + round(size * 1.25), sub, 11, 400, "middle", M)
    return out


ILLUSTRATIONS = {}


def add(key, alt, caption, height, body):
    ILLUSTRATIONS[key] = {
        "alt": alt, "caption": caption, "art": True,
        "svg": f'<svg viewBox="0 0 {W} {height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">{DEFS}{body}</svg>',
    }


def begin(key):
    global _current
    _current = key


# ─── 1. Virtual machines and containers ───────────────────────────────────────
begin("vm-container")
b = t(92, 22, "Virtual machines", 14, 700) + t(268, 22, "Containers", 14, 700)
for x in (17, 93):
    b += rect(x, 36, 72, 104, S, L) + rect(x + 7, 44, 58, 38, AS, "none", rx=7) + t(x + 36, 67, "App", 12, 600) + rect(x + 7, 90, 58, 42, S2, "none", rx=7) + tl(x + 36, 107, ["Its own", "guest OS"], 11, 400, "middle", T, 13)
b += rect(17, 148, 148, 34, WB, WBR) + t(91, 169, "Hypervisor", 12, 600, fill=WT) + rect(17, 190, 148, 34, S2, L) + t(91, 211, "Hardware", 12, 600)
for i, x in enumerate((193, 245, 297)):
    b += rect(x, 78, 46, 62, AS, L) + tl(x + 23, 104, ["App", "+ parts"], 11, 600, "middle", T, 14)
b += rect(193, 148, 150, 34, WB, WBR) + t(268, 169, "One shared OS kernel", 12, 600, fill=WT) + rect(193, 190, 150, 34, S2, L) + t(268, 211, "Hardware", 12, 600)
b += tl(91, 246, ["Each VM brings a whole", "operating system.", "Heavier, more isolated."], 11.5, 400, "middle", M, 15)
b += tl(268, 246, ["Containers share the", "host's kernel.", "Lighter, less isolated."], 11.5, 400, "middle", M, 15)
add("vm-container", "Two stacks side by side. On the left, two virtual machines each hold an app and their own guest operating system, on top of a hypervisor and hardware. On the right, three containers each hold an app and its parts, on top of one shared operating system kernel and hardware.",
    "A VM carries its own operating system. Containers share the host's kernel, so they are lighter but less isolated.", 296, b)

# ─── 2. Network part and host part of an address ──────────────────────────────
begin("subnet-split")
b = t(180, 22, "One address, two parts", 14, 700)
for i, (o, f) in enumerate([("192", AS), ("168", AS), ("5", AS), ("77", WB)]):
    x = 30 + i * 62
    b += rect(x, 38, 52, 44, f, L if i < 3 else WBR) + t(x + 26, 67, o, 18, 700, mono=True)
    if i < 3:
        b += t(x + 57, 68, ".", 18, 700)
b += chip(308, 60, "/24", A, "var(--accent-text)", 13, 700, True)
b += path("M30 92V98H206V92", A) + tl(118, 114, ["Network part: the first 24 bits", "the street"], 11.5, 600, "middle", T, 15)
b += path("M216 92V98H268V92", WBR) + tl(262, 114, ["Host part: 8 bits", "the house"], 11.5, 600, "middle", T, 15)
b += t(180, 166, "Every address on this street", 12, 600)
b += rect(20, 178, 70, 46, S2, L) + tl(55, 197, [".0", "network"], 11.5, 600, "middle", T, 14)
b += rect(96, 178, 168, 46, OKS, "none") + tl(180, 197, [".1 to .254", "254 usable hosts"], 11.5, 600, "middle", T, 14)
b += rect(270, 178, 70, 46, S2, L) + tl(305, 197, [".255", "broadcast"], 11.5, 600, "middle", T, 14)
b += tl(180, 246, ["8 host bits give 256 addresses.", "Two are reserved, so 254 are left for devices."], 11.5, 400, "middle", M, 15)
add("subnet-split", "The address 192.168.5.77 with the prefix /24. The first three numbers, 24 bits, are the network part, like a street. The last number, 8 bits, is the host part, like a house. In this subnet, .0 is the network address, .1 to .254 are 254 usable hosts and .255 is the broadcast address.",
    "The prefix says where the network part ends. What is left over numbers the devices.", 274, b)

# ─── 3. A DNS lookup ───────────────────────────────────────────────────────────
begin("dns-lookup")
b = node(laptop, 40, 44, "You") + node(server, 150, 44, "Resolver") + line(68, 44, 128, 44, A) + t(96, 16, "example.com?", 10.5, 600, fill=A)
b += tl(262, 38, ["asks on your behalf", "and remembers answers"], 11, 400, "middle", M, 14)
b += line(150, 98, 150, 318, LN, 1.5, "4 4", head=False)
rows = [("Root servers", "Where is example.com?", "Ask the .com servers"), (".com servers", "Where is example.com?", "Ask its own name server"), ("Authoritative", "Where is example.com?", "It is 203.0.113.10")]
for i, (who, ask, reply) in enumerate(rows):
    y = 128 + i * 68
    b += badge(126, y - 12, i + 1) + line(156, y - 12, 284, y - 12, A) + t(220, y - 19, ask, 10.5, 600)
    b += line(284, y + 10, 156, y + 10, OK if i == 2 else M, dash=None if i == 2 else "5 4") + t(220, y + 25, reply, 10.5, 600 if i == 2 else 400, fill=OK if i == 2 else M)
    b += server(318, y, T) + t(318, y + 32, who, 10.5, 600)
b += badge(150, 334, 4, OK) + line(136, 334, 68, 334, OK) + laptop(40, 332) + tl(256, 330, ["203.0.113.10, kept for the", "record's time to live (TTL)"], 11, 400, "middle", M, 14)
add("dns-lookup", "You ask a resolver where example.com is. The resolver asks the root servers, which point it to the .com servers. It asks the .com servers, which point it to the domain's authoritative server. The authoritative server answers with the address 203.0.113.10. The resolver returns it to you and keeps it for the record's time to live.",
    "The resolver does the walking: root, then .com, then the domain's own server. It caches the answer so the next lookup is instant.", 360, b)

# ─── 4. NAT ────────────────────────────────────────────────────────────────────
begin("nat")
b = t(64, 20, "Private network", 12, 700) + t(296, 20, "Internet", 12, 700)
for i, (ic, ip) in enumerate([(laptop, "192.168.1.10"), (phone, "192.168.1.11"), (laptop, "192.168.1.12")]):
    y = 56 + i * 62
    b += ic(34, y) + t(40, y + 30, ip, 10, 600, mono=True) + line(62, y, 148, 118, M)
b += router(172, 118) + t(172, 152, "Router with NAT", 12, 600) + line(196, 118, 268, 118, A) + cloud(296, 118) + chip(296, 72, "203.0.113.5", A, "var(--accent-text)", 11, 700, True)
b += tl(296, 150, ["everyone outside", "sees one address"], 11, 400, "middle", M, 14)
b += rect(20, 232, 320, 78, S, L) + t(34, 252, "The router's notebook", 11.5, 700, "start")
b += t(34, 272, "192.168.1.10 : 51000", 10.5, 400, "start", mono=True) + t(180, 272, "is", 10.5, 400, fill=M) + t(326, 272, "203.0.113.5 : 40001", 10.5, 400, "end", mono=True)
b += t(34, 292, "192.168.1.11 : 51000", 10.5, 400, "start", mono=True) + t(180, 292, "is", 10.5, 400, fill=M) + t(326, 292, "203.0.113.5 : 40002", 10.5, 400, "end", mono=True)
b += t(180, 330, "Port numbers tell the replies apart.", 11.5, 400, fill=M)
add("nat", "Three devices with private addresses 192.168.1.10, .11 and .12 connect through a router doing network address translation. On the internet side they all appear as the single public address 203.0.113.5. The router keeps a table that maps each private address and port to a different port on the public address.",
    "Many private addresses share one public address. The router rewrites each one and uses port numbers to send replies back to the right device.", 344, b)

# ─── 5. TCP's three-way handshake ─────────────────────────────────────────────
begin("tcp-handshake")
b = node(laptop, 60, 34, "Client") + node(server, 300, 34, "Server")
b += line(60, 86, 60, 232, LN, 1.5, "4 4", head=False) + line(300, 86, 300, 232, LN, 1.5, "4 4", head=False)
for i, (flag, say, right) in enumerate([("SYN", "“Can we talk?”", True), ("SYN-ACK", "“Yes. Can you hear me?”", False), ("ACK", "“Yes.”", True)]):
    y = 112 + i * 46
    b += (line(68, y, 292, y, A) if right else line(292, y, 68, y, A)) + chip(180, y - 14, flag, AS, T, 11, 700, True) + t(180, y + 16, say, 11, 400, fill=M) + badge(34 if right else 326, y, i + 1)
b += rect(40, 244, 280, 36, OKS, "none") + tick(62, 262) + t(190, 266, "Connection open: data can flow", 12, 600)
add("tcp-handshake", "A client and a server exchange three messages. First the client sends SYN, asking to talk. Second the server replies SYN-ACK, agreeing and asking to be heard. Third the client sends ACK. The connection is then open and data can flow.",
    "Three messages before any data: SYN, SYN-ACK, ACK. Both sides have now confirmed they can send and receive.", 294, b)

# ─── 6. A TLS handshake ───────────────────────────────────────────────────────
begin("tls-handshake")
b = node(laptop, 60, 34, "Your browser") + node(server, 300, 34, "Website")
b += line(60, 86, 60, 300, LN, 1.5, "4 4", head=False) + line(300, 86, 300, 300, LN, 1.5, "4 4", head=False)
b += badge(34, 108, 1) + line(68, 108, 292, 108, A) + t(180, 100, "Hello: here is what I support", 11, 600)
b += badge(326, 150, 2) + line(292, 150, 68, 150, A) + t(166, 142, "Hello, and my certificate", 11, 600) + doc(268, 134, A)
b += rect(72, 168, 190, 54, S, L) + badge(34, 195, 3) + tl(84, 187, ["Trusted issuer? Right name?", "Still valid?"], 11, 400, "start", T, 15) + tick(244, 195)
b += badge(34, 250, 4) + line(68, 250, 292, 250, A, both=True) + t(180, 242, "Agree on session keys", 11, 600) + key(166, 268, A) + key(206, 268, A)
b += rect(40, 306, 280, 40, OKS, "none") + lock(64, 324, OK, S) + tl(196, 322, ["Everything after this is encrypted", "with those session keys"], 11, 600, "middle", T, 14)
add("tls-handshake", "A browser and a website set up TLS in four steps. First the browser says hello and lists what it supports. Second the website replies with its certificate. Third the browser checks the certificate: a trusted issuer, the right name and still valid. Fourth the two sides agree on session keys. After that, everything is encrypted with those keys.",
    "The certificate proves which server this is. The key exchange gives both sides the same session keys without sending them.", 360, b)

# ─── 7. Full and split tunnel VPN ─────────────────────────────────────────────
begin("vpn-tunnel")


def tunnel(y):
    return rect(78, y - 12, 192, 24, AS, A, rx=12) + lock(174, y, A, S) + laptop(46, y) + server(304, y) + t(46, y + 30, "You", 11, 600) + t(304, y + 34, "Company", 11, 600)


b = t(16, 22, "Full tunnel", 14, 700, "start") + tunnel(104) + cloud(304, 44) + t(250, 48, "Internet", 11, 600)
b += line(84, 100, 262, 100, A) + line(84, 108, 262, 108, M) + line(304, 82, 304, 62, M)
b += t(180, 160, "Work traffic and web traffic both go through the tunnel.", 10.5, 400, fill=M)
b += line(16, 176, 344, 176, LN, 1, head=False)
b += t(16, 202, "Split tunnel", 14, 700, "start") + tunnel(292) + cloud(174, 228) + t(226, 232, "Internet", 11, 600)
b += line(84, 292, 262, 292, A) + path("M52 270C70 242 110 230 150 229", M, dash="5 4") + f'<path d="M144 225.5L152 229L144 232.5z" fill="{M}"/>'
b += tl(180, 348, ["Only work traffic uses the tunnel.", "Everything else goes straight to the internet."], 10.5, 400, "middle", M, 14)
add("vpn-tunnel", "Two pictures of a VPN between you and your company. In a full tunnel, both work traffic and web traffic travel through the encrypted tunnel to the company, and web traffic then goes out to the internet from there. In a split tunnel, only work traffic uses the tunnel and everything else goes straight from your device to the internet.",
    "Full tunnel: the company sees and protects everything, at the cost of speed. Split tunnel: faster, but the direct traffic is not inspected.", 374, b)

# ─── 8. An evil twin access point ─────────────────────────────────────────────
begin("evil-twin")
b = wifi(84, 40, T) + rect(62, 54, 44, 14, S, T, rx=4, sw=1.7) + tl(84, 88, ["“Cafe-WiFi”", "the real one"], 11.5, 600, "middle", T, 15)
b += wifi(262, 34, BAD) + rect(240, 48, 44, 14, BADS, BAD, rx=4, sw=1.7) + person(318, 44, BAD, BADS) + tl(268, 88, ["“Cafe-WiFi”", "the attacker's copy"], 11.5, 600, "middle", BAD, 15)
b += laptop(180, 206) + t(180, 238, "Your laptop", 12, 600)
b += line(160, 190, 100, 122, M, dash="5 4") + line(200, 190, 256, 122, BAD, 2)
b += tl(74, 160, ["weaker signal,", "ignored"], 10.5, 400, "middle", M, 13) + tl(290, 160, ["stronger signal,", "so it joins this"], 10.5, 600, "middle", BAD, 13)
b += path("M236 58H116", BAD, dash="5 4") + f'<path d="M122 54.5L114 58L122 61.5z" fill="{BAD}"/>' + t(176, 50, "passes traffic on", 10, 400, fill=BAD)
b += rect(20, 256, 320, 44, WB, WBR) + tl(180, 274, ["Same name, so the laptop cannot tell them apart.", "The attacker reads whatever is not encrypted."], 10.5, 600, "middle", WT, 14)
add("evil-twin", "A real access point named Cafe-WiFi and an attacker's copy with the same name. Your laptop joins the copy because its signal is stronger. The attacker passes your traffic on to the real network, so everything seems to work, while reading whatever is not encrypted.",
    "An evil twin copies a trusted network's name. Devices pick the stronger signal, and the attacker sits in the middle.", 314, b)

# ─── 9. Zero Trust: who decides, who enforces ─────────────────────────────────
begin("zero-trust")
b = rect(10, 8, 340, 138, "none", A, 12, 1.2, "5 4") + t(22, 26, "Control plane: decides", 11, 700, "start", A)
b += rect(150, 44, 190, 76, AS, L) + tl(245, 70, ["Policy Decision Point", "allow or deny,", "for this one request"], 11.5, 600, "middle", T, 15)
for i, s in enumerate(["Who is asking?", "Is the device healthy?", "Does the context fit?"]):
    y = 54 + i * 28
    b += t(18, y + 4, s, 10.5, 600, "start") + line(132, y, 146, min(max(y, 60), 104), M, 1.3)
b += rect(10, 160, 340, 152, "none", L, 12, 1.2, "5 4") + t(22, 178, "Data plane: enforces", 11, 700, "start", M)
b += person(46, 232) + t(46, 266, "Subject", 11.5, 600) + shield(180, 232, A, AS) + tl(180, 266, ["Policy Enforcement", "Point"], 11.5, 600, "middle", T, 14) + db(314, 232) + t(314, 266, "Resource", 11.5, 600)
b += line(66, 232, 160, 232, M) + badge(112, 220, 1) + line(200, 232, 292, 232, OK) + badge(246, 220, 4, OK)
b += line(172, 212, 172, 124, M) + badge(160, 150, 2) + line(190, 124, 190, 212, A) + badge(202, 150, 3)
b += t(180, 300, "1 request · 2 asks · 3 decision · 4 let through, this session only", 9.5, 400, fill=M)
add("zero-trust", "A Zero Trust layout in two parts. In the data plane, a subject sends a request to a Policy Enforcement Point that stands in front of the resource. The enforcement point asks the Policy Decision Point in the control plane. The decision point weighs who is asking, whether the device is healthy and whether the context fits, then returns allow or deny. Only then is the request let through, for that session only.",
    "The decision point decides, using identity, device and context. The enforcement point stands in the path and carries the decision out, one request at a time.", 322, b)

# ─── 10. Why passwords are salted before hashing ──────────────────────────────
begin("salted-hash")


def hash_row(y, who, secret, digest, tone, digest_fill):
    return (person(30, y) + t(30, y + 30, who, 10.5, 600) + t(62, y + 4, secret, 10.5, 600, "start", mono=True)
            + line(176, y, 200, y, M) + rect(204, y - 13, 44, 26, S2, L, rx=6) + t(226, y + 4, "hash", 10.5, 600) + line(252, y, 268, y, M)
            + rect(272, y - 13, 78, 26, digest_fill, "none", rx=6) + t(311, y + 4, digest, 10.5, 700, fill=tone, mono=True))


b = t(16, 20, "No salt", 14, 700, "start")
b += hash_row(52, "Alice", "sunshine1", "5e8f…a1c", BAD, BADS) + hash_row(112, "Bob", "sunshine1", "5e8f…a1c", BAD, BADS)
b += rect(20, 144, 320, 28, BADS, "none", rx=8) + t(180, 163, "Same password, same hash: crack one, crack both.", 10.5, 600)
b += line(16, 186, 344, 186, LN, 1, head=False)
b += t(16, 210, "With a random salt for each person", 14, 700, "start")
b += hash_row(242, "Alice", "sunshine1 + k9$x", "a3f1…77b", OK, OKS) + hash_row(302, "Bob", "sunshine1 + Qm2!", "9c0d…e42", OK, OKS)
b += rect(20, 334, 320, 28, OKS, "none", rx=8) + t(180, 353, "Different hashes: precomputed tables are useless.", 10.5, 600)
add("salted-hash", "Without a salt, Alice and Bob both use the password sunshine1 and both get the same hash, so cracking one cracks both. With a different random salt added for each person before hashing, the same password produces two different hashes, and precomputed tables of hashes are useless.",
    "A salt is a random value stored beside each password's hash. It is not secret; it only has to be different for every account.", 374, b)

# ─── 11. A digital signature ──────────────────────────────────────────────────
begin("digital-signature")
b = badge(22, 20, 1) + t(38, 24, "The sender signs", 13, 700, "start")
b += doc(40, 70) + t(40, 100, "Message", 10.5, 600) + line(60, 70, 84, 70, M) + rect(88, 56, 46, 28, S2, L, rx=6) + t(111, 74, "hash", 10.5, 600) + line(138, 70, 158, 70, M)
b += chip(190, 70, "digest", S, T, 10.5, 600, True, stroke=L) + line(224, 70, 244, 70, M) + rect(248, 38, 98, 64, AS, A) + key(295, 54, A, S) + t(297, 78, "sender's", 10, 600) + t(297, 91, "private key", 10, 700, fill=A)
b += line(297, 104, 297, 117, A) + chip(297, 130, "signature", A, "var(--accent-text)", 10.5, 700, True)
b += rect(20, 150, 320, 30, S2, "none", rx=8) + t(180, 170, "The message and the signature travel together.", 10.5, 600)
b += badge(22, 204, 2) + t(38, 208, "Anyone can check it", 13, 700, "start")
b += doc(40, 252) + t(40, 282, "Message", 10.5, 600) + line(60, 252, 84, 252, M) + rect(88, 238, 46, 28, S2, L, rx=6) + t(111, 256, "hash", 10.5, 600) + line(138, 252, 160, 252, M) + chip(196, 252, "digest A", S, T, 10.5, 600, True, stroke=L)
b += chip(54, 318, "signature", A, "var(--accent-text)", 10.5, 700, True) + line(98, 318, 112, 318, M) + rect(116, 296, 44, 44, AS, A) + key(140, 318, A, S) + line(164, 318, 178, 318, M) + chip(214, 318, "digest B", S, T, 10.5, 600, True, stroke=L)
b += t(138, 354, "sender's public key", 10, 600, fill=A)
b += path("M236 252H300V274", M) + path("M254 318H300V296", M) + rect(262, 272, 76, 26, WB, WBR, rx=13) + t(300, 289, "A = B ?", 11, 700, fill=WT, mono=True)
b += rect(20, 368, 320, 44, OKS, "none") + tick(42, 390) + tl(192, 386, ["They match: the message was not changed,", "and only the sender's private key made it."], 10.5, 600, "middle", T, 14)
add("digital-signature", "Signing: the sender hashes the message to get a digest, then signs the digest with their private key. The message and signature travel together. Checking: anyone hashes the received message to get digest A, and uses the sender's public key on the signature to get digest B. If A equals B, the message was not changed and only the sender's private key could have made the signature.",
    "Signing uses the private key; checking uses the public key. A match gives integrity, proof of origin and non-repudiation.", 424, b)

# ─── 12. Key exchange, with paint ─────────────────────────────────────────────
begin("key-exchange")
YEL, RED, BLU, ORA, GRN, BRN = "#E9C46A", "#D1495B", "#3A7CA5", "#E58E40", "#6A9F58", "#8A6A52"


def drop(cx, cy, col, r=15):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}" stroke="{L}" stroke-width="1.5"/>'


b = node(person, 60, 30, "Alice") + node(person, 300, 30, "Bob") + person(180, 30, M) + t(180, 64, "Anyone listening", 11, 600, fill=M)
b += drop(180, 104, YEL) + t(180, 136, "A public colour, seen by all", 10.5, 400, fill=M) + line(160, 104, 84, 104, M) + line(200, 104, 276, 104, M)
b += drop(46, 172, YEL, 12) + t(64, 177, "+", 14, 700) + drop(82, 172, RED, 12) + drop(278, 172, YEL, 12) + t(296, 177, "+", 14, 700) + drop(314, 172, BLU, 12)
b += t(64, 202, "adds a secret colour", 10, 400, fill=M) + t(296, 202, "adds a secret colour", 10, 400, fill=M)
b += drop(60, 240, ORA) + drop(300, 240, GRN) + line(80, 244, 278, 244, M, both=True) + tl(180, 228, ["the mixes are swapped", "in the open"], 10.5, 600, "middle", T, 13)
b += drop(46, 312, GRN, 12) + t(64, 317, "+", 14, 700) + drop(82, 312, RED, 12) + drop(278, 312, ORA, 12) + t(296, 317, "+", 14, 700) + drop(314, 312, BLU, 12)
b += t(64, 342, "adds own secret again", 10, 400, fill=M) + t(296, 342, "adds own secret again", 10, 400, fill=M)
b += drop(60, 384, BRN) + drop(300, 384, BRN) + rect(92, 366, 176, 36, OKS, "none") + tl(180, 381, ["Both arrive at the", "same shared secret"], 10.5, 700, "middle", T, 13)
b += rect(20, 414, 320, 30, S2, "none", rx=8) + t(180, 434, "The listener saw three colours but cannot un-mix paint.", 10.5, 600)
add("key-exchange", "A paint-mixing picture of key exchange. Alice and Bob start from a public colour that anyone can see. Each mixes in a secret colour of their own and they swap the mixtures in the open. Each then adds their own secret colour again to the mixture they received. Both end with the same final colour, the shared secret. Someone listening saw the public colour and both mixtures, but cannot un-mix them to get that final colour.",
    "Diffie-Hellman in paint: two people agree on a shared secret over an open channel without ever sending the secret itself.", 456, b)

# ─── 13. An on-path attack ────────────────────────────────────────────────────
begin("on-path")
b = t(180, 20, "What you think is happening", 12, 700)
b += laptop(50, 58) + server(310, 58) + line(78, 58, 286, 58, M, dash="5 4", both=True) + t(50, 90, "You", 11.5, 600) + t(310, 94, "Your bank", 11.5, 600)
b += line(16, 112, 344, 112, LN, 1, head=False) + t(180, 136, "What is really happening", 12, 700)
b += laptop(50, 196) + server(310, 196) + person(180, 190, BAD, BADS) + t(50, 228, "You", 11.5, 600) + t(310, 232, "Your bank", 11.5, 600) + t(180, 222, "Attacker", 11.5, 700, fill=BAD)
b += line(78, 196, 158, 196, BAD, 2, both=True) + line(202, 196, 286, 196, BAD, 2, both=True)
b += tl(180, 248, ["reads, and can change,", "everything that passes"], 10.5, 600, "middle", BAD, 13)
b += rect(20, 280, 320, 46, OKS, "none") + lock(44, 302, OK, S) + tl(194, 298, ["TLS that checks the certificate stops this:", "the attacker cannot prove it is the bank."], 10.5, 600, "middle", T, 14)
add("on-path", "You believe you are talking directly to your bank. In reality an attacker sits between you and the bank, relaying everything, so they can read and change what passes. TLS that checks the server's certificate stops this, because the attacker cannot prove it is the bank.",
    "An on-path attacker relays traffic between two sides who each think they are talking directly. Checking the certificate is what breaks it.", 338, b)

# ─── 14. SQL injection ────────────────────────────────────────────────────────
begin("sql-injection")
b = rect(40, 12, 280, 96, S, L) + t(56, 34, "Sign in", 12, 700, "start")
b += t(56, 56, "Username", 10, 400, "start", M) + rect(120, 42, 184, 22, S2, BAD, rx=5) + t(128, 57, "admin' --", 11, 700, "start", BAD, True)
b += t(56, 88, "Password", 10, 400, "start", M) + rect(120, 74, 184, 22, S2, L, rx=5) + t(128, 89, "anything", 11, 400, "start", M, True)
b += line(180, 112, 180, 132, M) + t(190, 127, "pasted into the query as-is", 10.5, 400, "start", M)
b += rect(14, 138, 332, 74, S, L) + t(26, 160, "SELECT * FROM users", 10.5, 400, "start", T, True)
b += t(26, 178, "WHERE name = '", 10.5, 400, "start", T, True) + rect(114, 166, 68, 17, BADS, "none", rx=4) + t(117, 178, "admin' --", 10.5, 700, "start", BAD, True)
b += t(26, 198, "' AND password = 'anything'", 10.5, 400, "start", M, True) + line(24, 194, 202, 194, M, 1.2, head=False)
b += tl(280, 176, ["-- starts a comment,", "so the password check", "is thrown away"], 9.5, 600, "middle", BAD, 12)
b += rect(20, 224, 320, 30, BADS, "none", rx=8) + cross(40, 239) + t(190, 243, "Signed in as admin, with no password", 11, 700)
b += rect(20, 264, 320, 46, OKS, "none") + tick(40, 287) + tl(192, 283, ["Fix: parameterized queries.", "Input is always treated as data, never as code."], 10.5, 600, "middle", T, 14)
add("sql-injection", "A sign-in form where the username field contains admin, a quote mark and two dashes. The app pastes that text straight into its database query. The quote ends the name early and the two dashes turn the rest, the password check, into a comment. The attacker is signed in as admin with no password. The fix is parameterized queries, which always treat input as data and never as code.",
    "Injection works when input is pasted into a command. The attacker's text stops being data and becomes part of the instruction.", 322, b)

# ─── 15. A distributed denial of service ──────────────────────────────────────
begin("ddos")
b = person(40, 34, BAD, BADS) + tl(40, 64, ["Attacker"], 11, 700, "middle", BAD)
bots = [(128, 34), (196, 34), (112, 96), (180, 96), (128, 158), (196, 158)]
b += rect(84, 8, 140, 176, "none", BAD, 12, 1.2, "4 4") + line(60, 34, 82, 34, BAD, 1.4, "4 4")
for x, y in bots:
    b += laptop(x, y, BAD, BADS) + line(x + 24, y, 284, 96 + (y - 96) * 0.22, BAD, 1.4)
b += t(154, 202, "thousands of hijacked devices", 10.5, 600, fill=BAD)
b += server(312, 96, BAD, BADS) + cross(330, 74) + tl(312, 132, ["Server", "overwhelmed"], 11, 700, "middle", T, 14)
b += line(16, 218, 344, 218, LN, 1, head=False)
b += person(50, 250, OK, OKS) + t(50, 284, "Real customer", 11, 600) + line(72, 250, 248, 250, M, dash="5 4") + cross(262, 250) + tl(300, 246, ["cannot", "get in"], 11, 700, "middle", T, 14)
b += t(180, 308, "The data is not stolen. The service is simply unavailable.", 10.5, 400, fill=M)
add("ddos", "An attacker controls many hijacked devices. All of them send traffic to one server at the same time, and the server is overwhelmed. A real customer's request cannot get in. No data is stolen; the service is simply unavailable.",
    "A DDoS attacks availability: so many sources flood the target that real users are crowded out.", 322, b)

# ─── 16. Tokenization ─────────────────────────────────────────────────────────
begin("tokenization")
b = card(44, 50) + t(86, 86, "4111 1111 1111 1111", 10.5, 700, mono=True) + t(86, 100, "the real card number", 10, 400, fill=M)
b += line(70, 50, 126, 50, M) + rect(130, 28, 100, 44, AS, A) + tl(180, 47, ["Token", "service"], 11.5, 700, "middle", T, 14) + line(234, 50, 280, 50, M)
b += db(306, 46) + lock(322, 62, T, S) + tl(304, 92, ["Vault: keeps the", "real number"], 10.5, 600, "middle", T, 13)
b += line(180, 76, 180, 128, A) + chip(180, 144, "tok_8fK2q9Zr", A, "var(--accent-text)", 11, 700, True) + t(240, 148, "a random token", 10, 400, "start", M)
b += line(180, 160, 180, 184, A) + db(180, 212) + t(180, 246, "The shop's database", 11.5, 600) + t(180, 260, "stores only the token", 10.5, 400, fill=M)
b += person(308, 208, BAD, BADS) + t(308, 240, "Thief", 11, 700, fill=BAD) + line(286, 212, 204, 212, BAD, 1.6)
b += rect(20, 276, 320, 46, WB, WBR) + tl(180, 294, ["A stolen token is useless on its own. It has no", "mathematical link to the number: only the vault knows."], 10.5, 600, "middle", WT, 14)
add("tokenization", "A real card number goes into a token service. The service keeps the real number in a separate, locked vault and hands back a random token. The shop's database stores only the token. A thief who steals the shop's database gets tokens, which are useless on their own because only the vault can map a token back to the number.",
    "Tokenization swaps a sensitive value for a random stand-in. Unlike encryption, there is no key that turns a token back into the value.", 334, b)

# ─── 17. Load balancing and failover ──────────────────────────────────────────
begin("load-balancer")
for x in (120, 180, 240):
    b_ = person(x, 30)
    b = (b if x != 120 else "") + b_ + line(x, 50, 180 + (x - 180) * 0.3, 80, M, 1.4)
b += t(300, 34, "Requests", 11, 600, fill=M)
b += rect(100, 84, 160, 44, AS, A) + tl(180, 103, ["Load balancer", "checks who is healthy"], 11, 700, "middle", T, 14)
for x, ok in ((64, True), (180, True), (296, False)):
    c, f = (T, S) if ok else (BAD, BADS)
    b += server(x, 204, c, f)
    if ok:
        b += line(180 + (x - 180) * 0.35, 132, x, 180, OK, 1.8) + tick(x + 20, 184)
    else:
        b += line(180 + (x - 180) * 0.35, 132, x - 8, 172, M, 1.4, "4 4", head=False) + cross(x + 20, 184)
b += t(64, 240, "Server 1", 11, 600) + t(180, 240, "Server 2", 11, 600) + t(296, 240, "Server 3", 11, 700, fill=BAD) + t(296, 254, "failed", 10.5, 400, fill=BAD)
b += rect(20, 270, 320, 44, OKS, "none") + tl(180, 288, ["Requests are spread across the healthy servers.", "The failed one gets nothing until it recovers."], 10.5, 600, "middle", T, 14)
add("load-balancer", "Requests from several people arrive at a load balancer, which checks which servers are healthy. It spreads the requests across servers 1 and 2. Server 3 has failed, so it receives nothing until it recovers.",
    "A load balancer shares the work and routes around a failed server, so one failure does not take the service down.", 326, b)

# ─── 18. RPO and RTO on one timeline ──────────────────────────────────────────
begin("rpo-rto")
b = line(20, 110, 340, 110, T, 2, head=True)
pts = [(64, "02:00", "Last backup", T, S), (180, "06:00", "Failure", BAD, BADS), (300, "09:00", "Back online", OK, OKS)]
for x, clock, what, c, f in pts:
    b += circle(x, 110, 7, f, c, 2) + t(x, 84, what, 11.5, 700, fill=c if c != T else T) + t(x, 68, clock, 10.5, 600, fill=M, mono=True)
b += db(64, 34) + cross(180, 38, BAD, 11) + tick(300, 38, OK, 11)
b += rect(64, 126, 116, 30, WB, WBR, rx=6) + t(122, 146, "RPO", 13, 700, fill=WT) + rect(180, 126, 120, 30, AS, A, rx=6) + t(240, 146, "RTO", 13, 700)
b += tl(108, 176, ["How much recent work", "you can afford to lose"], 10.5, 600, "middle", T, 14) + tl(252, 176, ["How long you can", "afford to be down"], 10.5, 600, "middle", T, 14)
b += tl(108, 210, ["Here: 4 hours of work", "since the backup is gone"], 10.5, 400, "middle", M, 14) + tl(252, 210, ["Here: 3 hours until", "service is restored"], 10.5, 400, "middle", M, 14)
b += rect(20, 244, 320, 44, S, L) + tl(180, 262, ["Smaller RPO: back up more often.", "Smaller RTO: recover faster, for example a hot site."], 10.5, 600, "middle", T, 14)
add("rpo-rto", "A timeline with three points: the last backup at 02:00, a failure at 06:00 and service back online at 09:00. The stretch from the last backup to the failure is the recovery point objective, how much recent work you can afford to lose; here four hours of work is gone. The stretch from the failure to service restored is the recovery time objective, how long you can afford to be down; here three hours.",
    "RPO looks backward from the failure to the last backup. RTO looks forward from the failure to recovery.", 300, b)

# ─── 19. IDS and IPS ──────────────────────────────────────────────────────────
begin("ids-ips")


def packet(x, y, c):
    return f'<circle cx="{x}" cy="{y}" r="5" fill="{c}"/>'


b = t(16, 22, "IDS: watches a copy and raises the alarm", 12.5, 700, "start")
b += cloud(40, 78) + t(40, 108, "Internet", 10.5, 600) + line(62, 78, 286, 78, M) + server(314, 78) + t(314, 112, "Your network", 10.5, 600)
b += circle(160, 78, 4, T, T) + line(160, 82, 160, 118, M, dash="4 3") + t(170, 104, "a copy", 10, 400, "start", M) + rect(118, 122, 84, 30, AS, A) + t(160, 141, "IDS", 12, 700)
b += line(206, 137, 232, 137, BAD) + bell(250, 136, BAD, BADS) + t(292, 141, "alert", 11, 700, fill=BAD)
b += packet(232, 78, BAD) + t(232, 66, "attack still arrives", 10, 600, fill=BAD)
b += line(16, 172, 344, 172, LN, 1, head=False)
b += t(16, 196, "IPS: stands in the path and can block", 12.5, 700, "start")
b += cloud(40, 252) + t(40, 282, "Internet", 10.5, 600) + line(62, 252, 132, 252, M) + rect(136, 232, 88, 40, AS, A) + shield(160, 252, A, S) + t(196, 256, "IPS", 12, 700) + line(228, 252, 286, 252, OK) + server(314, 252) + t(314, 286, "Your network", 10.5, 600)
b += packet(92, 252, BAD) + cross(128, 238, BAD, 7) + t(92, 238, "blocked", 10, 700, fill=BAD) + packet(256, 252, OK) + t(256, 240, "safe traffic", 10, 600, fill=OK)
b += tl(180, 308, ["Inline means it can stop an attack, and also that", "a mistake or failure can stop real traffic."], 10.5, 400, "middle", M, 14)
add("ids-ips", "Two layouts. An intrusion detection system receives a copy of the traffic and raises an alert, but the attack still reaches your network. An intrusion prevention system stands in the path of the traffic: it blocks the attack and lets safe traffic through. Being inline also means a mistake or failure can stop real traffic.",
    "An IDS detects and tells you. An IPS sits inline, so it can block, and so its mistakes matter more.", 334, b)

# ─── 20. SPF, DKIM and DMARC ──────────────────────────────────────────────────
begin("email-auth")
b = node(server, 46, 36, "Sender", None) + t(46, 84, "bank.example", 10, 400, fill=M, mono=True) + node(server, 300, 36, "Your mail server", None, T, 11)
b += line(72, 36, 272, 36, M) + envelope(180, 36) + t(180, 66, "“From: bank.example”", 10.5, 600)
b += t(180, 104, "It looks up bank.example's DNS records and asks:", 10.5, 600)
rows = [("SPF", "Is this server allowed to send", "for bank.example?", "the guest list"), ("DKIM", "Does the message's signature", "match the domain's public key?", "the wax seal"), ("DMARC", "If either fails: deliver, quarantine", "or reject? And send a report.", "the rules")]
for i, (name, q1, q2, like) in enumerate(rows):
    y = 118 + i * 62
    b += rect(14, y, 332, 54, S, L) + chip(50, y + 20, name, A, "var(--accent-text)", 11, 700, True) + t(50, y + 44, like, 9.5, 400, fill=M) + tl(92, y + 23, [q1, q2], 10.5, 400, "start", T, 15)
b += line(110, 306, 90, 322, OK) + line(250, 306, 270, 322, BAD)
b += rect(20, 326, 150, 34, OKS, "none") + tick(38, 343) + t(104, 347, "Passes: inbox", 11, 700)
b += rect(190, 326, 150, 34, BADS, "none") + cross(208, 343) + tl(274, 340, ["Fails: quarantine", "or reject"], 10.5, 700, "middle", T, 13)
add("email-auth", "A message claiming to be from bank.example arrives at your mail server. Your server looks up bank.example's DNS records and asks three things. SPF: is the sending server on the list allowed to send for this domain? DKIM: does the message's signature match the domain's public key? DMARC: if either check fails, should the message be delivered, quarantined or rejected, and where should a report go? Messages that pass go to the inbox; failures are quarantined or rejected.",
    "SPF is the guest list, DKIM is the wax seal, and DMARC is the domain owner's rule for what to do when either one fails.", 372, b)

# ─── 21. Single sign-on and federation ────────────────────────────────────────
begin("sso-federation")
b = person(50, 44) + t(50, 78, "You", 11.5, 600)
b += rect(170, 14, 176, 72, AS, A) + shield(200, 50, A, S) + tl(274, 40, ["Identity provider", "you sign in here,", "once"], 11, 600, "middle", T, 14)
b += line(72, 44, 166, 44, A) + badge(118, 30, 1)
b += t(118, 62, "password + MFA", 10, 400, fill=M)
apps = [(64, "Email"), (180, "HR app"), (296, "Partner site")]
for i, (x, name) in enumerate(apps):
    b += line(258 + (x - 180) * 0.25, 90, x, 168, A, 1.6) + rect(x - 44, 172, 88, 50, S, L) + t(x, 202, name, 11.5, 700)
b += badge(180, 122, 2) + chip(264, 136, "“This is Sam” (signed)", S, T, 10, 600, False, 7, L)
b += rect(244, 162, 106, 86, "none", WBR, 10, 1.2, "5 4") + tl(297, 238, ["another organization"], 9.5, 600, "middle", WT)
b += rect(20, 262, 320, 60, S2, "none") + tl(180, 280, ["Each app trusts the provider's signed statement.", "No app ever sees your password.", "Across organizations, this trust is called federation."], 10.5, 600, "middle", T, 15)
add("sso-federation", "You sign in once at an identity provider with your password and multifactor authentication. The identity provider then sends each application, here email, an HR app and a partner's site in another organization, a signed statement saying who you are. Each app trusts that statement, so no app ever sees your password. When that trust crosses organizations it is called federation.",
    "Single sign-on: authenticate once, and the identity provider vouches for you to every app. Federation extends that trust to other organizations.", 334, b)

# ─── 22. OAuth authorization code flow with PKCE ──────────────────────────────
begin("oauth-pkce")
XS = (56, 180, 304)
b = laptop(XS[0], 30) + shield(XS[1], 30, A, AS) + db(XS[2], 30)
b += tl(XS[0], 62, ["The app", "(client)"], 10.5, 700, "middle", T, 13) + tl(XS[1], 62, ["Authorization", "server"], 10.5, 700, "middle", T, 13) + tl(XS[2], 62, ["The API", "(resource server)"], 10.5, 700, "middle", T, 13)
head = b
b = ""
steps = [
    (0, 1, A, "Please sign this person in.", "Here is a hash of my secret (the code challenge)."),
    (1, 1, M, "You sign in and approve what the app may do.", None),
    (1, 0, A, "A short-lived code, sent to the registered redirect URI.", None),
    (0, 1, A, "The code, plus the secret itself (the code verifier).", "The server checks it matches the hash from step 1."),
    (1, 0, OK, "An access token. With OpenID Connect, an ID token too.", None),
    (0, 2, OK, "A request to the API, carrying the access token.", None),
]
y = 100
for i, (a, z, c, l1, l2) in enumerate(steps):
    b += badge(14, y + 5, i + 1, c) + t(28, y + 9, l1, 10, 600, "start")
    if l2:
        b += t(28, y + 22, l2, 10, 400, "start", M)
        y += 13
    y += 20
    if a == z:
        b += person(XS[a], y + 16, T, S)
        y += 42
    else:
        b += line(XS[a] + (8 if z > a else -8), y, XS[z] + (-8 if z > a else 8), y, c, 1.8)
        y += 22
b = head + "".join(line(x, 86, x, y - 4, LN, 1.5, "4 4", head=False) for x in XS) + b
b += rect(20, y + 6, 320, 30, WB, WBR, rx=8) + t(180, y + 25, "A stolen code is useless without the secret verifier.", 10.5, 600, fill=WT)
oauth_height = y + 48
add("oauth-pkce", "The OAuth authorization code flow with PKCE in six steps. One, the app asks the authorization server to sign the person in and sends a hash of a secret it just made, the code challenge. Two, the person signs in and approves what the app may do. Three, the authorization server sends a short-lived code to the registered redirect URI. Four, the app sends the code together with the secret itself, the code verifier, and the server checks it matches the hash from step one. Five, the server returns an access token, and with OpenID Connect an ID token too. Six, the app calls the API with the access token. A stolen code is useless without the secret verifier.",
    "PKCE ties the code to the app that started the flow. Only that app knows the secret behind the hash it sent at the start.", oauth_height, b)

# ─── 23. A risk matrix ────────────────────────────────────────────────────────
begin("risk-matrix")
b = t(214, 20, "Impact: how bad would it be?", 11.5, 700)
levels = ["Low", "Medium", "High"]
grid = [["Medium", "High", "High"], ["Low", "Medium", "High"], ["Low", "Low", "Medium"]]
tone = {"Low": (OKS, OK), "Medium": (WB, WT), "High": (BADS, BAD)}
for c, name in enumerate(levels):
    b += t(132 + c * 82, 42, name, 11, 600, fill=M)
for r in range(3):
    b += t(82, 86 + r * 58, levels[2 - r], 11, 600, "end", M)
    for c in range(3):
        f, col = tone[grid[r][c]]
        b += rect(92 + c * 82, 52 + r * 58, 78, 54, f, "none", rx=8) + t(131 + c * 82, 84 + r * 58, grid[r][c], 11.5, 700, fill=col)
b += t(14, 42, "Likelihood", 10.5, 700, "start")
b += badge(318, 64, "A", T) + badge(104, 212, "B", T)
b += rect(14, 238, 332, 82, S, L) + badge(32, 258, "A", T) + tl(48, 256, ["A phished admin password: likely, and", "very harmful. Treat this first."], 10.5, 600, "start", T, 14)
b += badge(32, 298, "B", T) + tl(48, 296, ["The lobby display going offline: unlikely,", "and minor. Reasonable to accept."], 10.5, 600, "start", T, 14)
add("risk-matrix", "A three by three grid. Likelihood runs up the side from low to high and impact runs across from low to high. Cells toward the top right are high risk, cells toward the bottom left are low risk and the diagonal between is medium. Example A, a phished admin password, is likely and very harmful, so it sits in the top right and is treated first. Example B, the lobby display going offline, is unlikely and minor, so it sits in the bottom left and is reasonable to accept.",
    "Risk is likelihood and impact together. The matrix turns a long list of worries into an order for dealing with them.", 332, b)

if PROBLEMS:
    raise SystemExit("\n".join(PROBLEMS))
