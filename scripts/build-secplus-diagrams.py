#!/usr/bin/env python3
"""Draw the Security+ pathway's diagrams as inline SVG that follows Atlas's light and dark colours.

Writes content-src/secplus/diagrams.json. Run it before scripts/build-secplus.py when a diagram changes.
"""
import json
import pathlib
from html import escape

OUT = pathlib.Path(__file__).resolve().parent.parent / "content-src" / "secplus" / "diagrams.json"
HEAD = '<defs><marker id="sa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--muted)"/></marker></defs>'
FILLS = {"plain": "var(--surface-2)", "soft": "var(--accent-soft)", "paper": "var(--surface)"}


def text(x, y, s, size=13, weight=400, anchor="middle", color="var(--text)"):
    return f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{color}" font-family="system-ui,sans-serif">{escape(s)}</text>'


def box(x, y, w, h, lines, fill="plain", weight=600):
    if isinstance(lines, str):
        lines = [lines]
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{FILLS[fill]}" stroke="var(--line-strong)"/>'
    start = y + h / 2 - (len(lines) - 1) * 8 + 4
    for i, line in enumerate(lines):
        out += text(x + w / 2, start + i * 16, line, weight=weight if i == 0 else 400, size=13 if i == 0 else 12)
    return out


def arrow(x1, y1, x2, y2, label=None, both=False, dy=-6):
    extra = ' marker-start="url(#sa)"' if both else ""
    out = f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="var(--muted)" stroke-width="1.5" marker-end="url(#sa)"{extra}/>'
    if label:
        out += text((x1 + x2) / 2, (y1 + y2) / 2 + dy, label, size=11, color="var(--muted)")
    return out


def zone(x, y, w, h, label):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="none" stroke="var(--accent)" stroke-dasharray="5 4"/>' + text(x + 10, y + 16, label, size=11, weight=600, anchor="start", color="var(--accent)")


def svg(height, body):
    return f'<svg viewBox="0 0 720 {height}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">{HEAD}{body}</svg>'


D = {}


def add(key, alt, caption, height, body):
    D[key] = {"alt": alt, "caption": caption, "svg": svg(height, body)}


add("three-tier", "A browser on the internet connects to a web tier, which connects to an application tier, which connects to a database.",
    "Each tier talks only to its neighbour. Data from the browser crosses a trust boundary.", 170,
    zone(170, 14, 540, 140, "Your organization")
    + box(20, 60, 120, 56, ["Browser", "the client"]) + box(190, 60, 140, 56, ["Web tier", "public-facing"], "soft") + box(370, 60, 140, 56, ["Application tier", "business logic"], "soft") + box(550, 60, 140, 56, ["Database", "stored data"], "soft")
    + arrow(140, 88, 190, 88, None, True) + arrow(330, 88, 370, 88, None, True) + arrow(510, 88, 550, 88, None, True) + text(155, 138, "trust boundary", 11, color="var(--muted)"))

layers = ["Data and access", "Application", "Operating system", "Virtualization and hardware"]
owners = [["You", "You", "You", "You"], ["You", "You", "You", "Provider"], ["You", "You", "Provider", "Provider"], ["You", "Provider", "Provider", "Provider"]]
body = "".join(text(250 + 125 * i, 24, h, 13, 600) for i, h in enumerate(["On-premises", "IaaS", "PaaS", "SaaS"]))
for r, l in enumerate(layers):
    y = 38 + r * 48
    body += text(10, y + 27, l, 12, 600, "start")
    for c, o in enumerate(owners[r]):
        body += box(195 + c * 125, y, 110, 40, o, "soft" if o == "You" else "plain", 500)
add("cloud-responsibility", "A grid showing that customers manage everything on-premises, and that the provider takes on more layers in IaaS, PaaS and SaaS, while data and access always stay with the customer.",
    "Moving right, the provider takes on more. Data and access stay with you in every model.", 240, body)

osi = [("7 Application", "HTTP, DNS, SSH", "Application"), ("6 Presentation", "formats, encryption", "Application"), ("5 Session", "conversations", "Application"), ("4 Transport", "TCP, UDP, ports", "Transport"), ("3 Network", "IP, routers", "Internet"), ("2 Data link", "MAC, switches", "Link"), ("1 Physical", "cables, radio", "Link")]
body = text(150, 22, "OSI model", 14, 700) + text(380, 22, "Examples", 14, 700) + text(610, 22, "TCP/IP model", 14, 700)
for i, (a, b, _) in enumerate(osi):
    body += box(40, 34 + i * 42, 220, 36, a, "soft", 600) + box(280, 34 + i * 42, 200, 36, b, "plain", 400)
body += box(520, 34, 180, 120, "Application", "soft") + box(520, 160, 180, 36, "Transport", "soft") + box(520, 202, 180, 36, "Internet", "soft") + box(520, 244, 180, 78, "Link", "soft")
add("osi-tcpip", "The seven OSI layers beside the four TCP/IP layers. OSI application, presentation and session map to TCP/IP application; transport maps to transport; network maps to internet; data link and physical map to link.",
    "OSI's seven layers beside the four TCP/IP layers that real networks use.", 336, body)

add("encapsulation", "Application data is wrapped by a TCP header to form a segment, by an IP header to form a packet, and by a frame header and trailer to form a frame.",
    "Each layer wraps the one above it. The receiver unwraps in reverse.", 210,
    box(430, 16, 240, 36, "Application data", "soft") + text(30, 39, "Data", 12, 600, "start")
    + box(330, 64, 100, 36, "TCP header") + box(430, 64, 240, 36, "Data", "soft") + text(30, 87, "Segment (transport)", 12, 600, "start")
    + box(230, 112, 100, 36, "IP header") + box(330, 112, 340, 36, "Segment", "soft") + text(30, 135, "Packet (network)", 12, 600, "start")
    + box(170, 160, 60, 36, "Frame") + box(230, 160, 380, 36, "Packet", "soft") + box(610, 160, 60, 36, "Trailer") + text(30, 183, "Frame (data link)", 12, 600, "start"))

add("network-map", "Laptops and a printer connect to a switch and a wireless access point, which connect to a router and firewall, which connects through NAT to the internet.",
    "A small network. The switch connects local devices, and the router connects this network to others.", 220,
    zone(10, 14, 470, 192, "Private network 192.168.1.0/24")
    + box(30, 44, 110, 40, "Laptop") + box(30, 92, 110, 40, "Printer") + box(30, 152, 110, 40, "Phone")
    + box(190, 66, 110, 44, "Switch", "soft") + box(190, 150, 110, 44, "Access point", "soft") + box(345, 96, 120, 56, ["Router", "firewall + NAT"], "soft") + box(560, 96, 140, 56, ["Internet", "public addresses"])
    + arrow(140, 64, 190, 82, None, True) + arrow(140, 112, 190, 94, None, True) + arrow(140, 172, 190, 172, "Wi-Fi", True) + arrow(300, 88, 345, 118, None, True) + arrow(300, 172, 345, 138, None, True) + arrow(465, 124, 560, 124, None, True))

add("segmentation", "The internet connects through a firewall to a screened subnet with a web server. A second firewall separates internal user and server zones, and an operational technology zone is isolated.",
    "Security zones. Traffic between zones must pass through a policy enforcement point.", 240,
    box(10, 96, 100, 50, "Internet") + box(150, 92, 100, 58, ["Firewall", "edge"], "soft")
    + zone(280, 14, 150, 212, "Screened subnet") + box(295, 96, 120, 50, "Web server")
    + box(450, 92, 76, 58, ["Internal", "firewall"], "soft")
    + zone(550, 14, 160, 66, "User zone") + box(565, 36, 130, 36, "Workstations")
    + zone(550, 88, 160, 66, "Server zone") + box(565, 110, 130, 36, "Databases")
    + zone(550, 162, 160, 66, "OT zone") + box(565, 184, 130, 36, "Controllers")
    + arrow(110, 121, 150, 121, None, True) + arrow(250, 121, 295, 121, None, True) + arrow(415, 121, 450, 121, None, True) + arrow(526, 110, 565, 56, None, True) + arrow(526, 121, 565, 128, None, True) + arrow(526, 134, 565, 200))

add("aaa", "A user first proves who they are with authentication, then authorization decides what they may do, then accounting records what they did.",
    "Authentication proves who. Authorization decides what. Accounting records what happened.", 150,
    box(20, 40, 100, 60, "User") + box(165, 30, 165, 80, ["Authentication", "Who are you?"], "soft") + box(365, 30, 165, 80, ["Authorization", "What may you do?"], "soft") + box(565, 30, 140, 80, ["Accounting", "What did you do?"], "soft")
    + arrow(120, 70, 165, 70) + arrow(330, 70, 365, 70) + arrow(530, 70, 565, 70))

add("crypto", "Symmetric encryption uses one shared key to encrypt and decrypt. Asymmetric encryption encrypts with the receiver's public key and decrypts with the matching private key.",
    "Symmetric uses one shared key. Asymmetric uses a matched pair.", 240,
    text(14, 24, "Symmetric: the same key on both sides", 13, 700, "start")
    + box(14, 36, 120, 50, "Plaintext") + box(200, 36, 130, 50, "Ciphertext", "soft") + box(400, 36, 120, 50, "Plaintext") + arrow(134, 61, 200, 61, "encrypt: key K") + arrow(330, 61, 400, 61, "decrypt: key K")
    + text(14, 128, "Asymmetric: a public and private pair", 13, 700, "start")
    + box(14, 140, 120, 50, "Plaintext") + box(200, 140, 130, 50, "Ciphertext", "soft") + box(400, 140, 120, 50, "Plaintext") + arrow(134, 165, 200, 165, "receiver's public") + arrow(330, 165, 400, 165, "receiver's private")
    + text(540, 61, "Fast. Used for bulk data.", 12, anchor="start", color="var(--muted)") + text(540, 165, "Slower. Used for key", 12, anchor="start", color="var(--muted)") + text(540, 181, "exchange and signatures.", 12, anchor="start", color="var(--muted)"))

add("pki", "A root certificate authority signs an intermediate certificate authority, which signs a server certificate. A browser that trusts the root can validate the chain and check revocation.",
    "A chain of trust. The browser trusts the root, so it can verify what the root vouches for.", 200,
    box(20, 20, 170, 60, ["Root CA", "root of trust"], "soft") + box(275, 20, 170, 60, ["Intermediate CA", "issues certificates"], "soft") + box(530, 20, 170, 60, ["Server certificate", "www.example.com"], "soft")
    + arrow(190, 50, 275, 50, "signs") + arrow(445, 50, 530, 50, "signs")
    + box(275, 124, 170, 56, ["Browser", "trusts the root"]) + box(530, 124, 170, 56, ["CRL or OCSP", "is it revoked?"])
    + arrow(445, 152, 530, 152, "checks", True) + arrow(360, 124, 590, 80, None) + text(445, 112, "validates chain", 11, color="var(--muted)"))

layers_d = [(14, 700, "Policies, training and procedures"), (50, 600, "Physical security"), (86, 500, "Network controls"), (122, 400, "Endpoint controls"), (158, 300, "Application controls")]
body = ""
for i, (y, w, label) in enumerate(layers_d):
    x = (720 - w) / 2
    body += box(x, y, w, 32, label, "soft" if i % 2 else "plain", 500)
body += box(280, 194, 160, 34, "Data", "soft")
add("defense-layers", "Nested layers from policies and training down through physical, network, endpoint and application controls to the data at the centre.",
    "Defense in depth. If one layer fails, others still stand between an attacker and the data.", 240, body)

phases = ["Preparation", "Identification", "Investigation", "Containment", "Eradication and recovery", "Post-incident"]
body = ""
for i, p in enumerate(phases):
    x, y = 10 + (i % 3) * 240, 20 + (i // 3) * 92
    body += box(x, y, 210, 58, [f"{i + 1}. {p}"], "soft")
body += arrow(220, 49, 250, 49) + arrow(460, 49, 490, 49) + arrow(595, 78, 115, 112) + arrow(220, 141, 250, 141) + arrow(460, 141, 490, 141)
add("incident-response", "Six incident response stages in order: preparation, identification, investigation, containment, eradication and recovery, and post-incident activity.",
    "The stages overlap in practice, and lessons learned feed back into preparation.", 190, body)

add("oauth-oidc", "OAuth 2.0 gives an app an access token to call an API on the user's behalf. OpenID Connect adds an ID token on top of OAuth that tells the app who signed in.",
    "OAuth answers what an app may access. OpenID Connect adds who the user is.", 220,
    box(20, 76, 110, 56, "User") + box(210, 20, 180, 60, ["Authorization server", "asks user to consent"], "soft") + box(210, 140, 180, 60, ["Client application"], "soft") + box(530, 20, 170, 60, ["ID token", "OIDC: who signed in"]) + box(530, 140, 170, 60, ["Access token", "OAuth: calls the API"])
    + arrow(130, 96, 210, 56, "signs in") + arrow(390, 50, 530, 50, "issues") + arrow(300, 80, 300, 140, "tokens") + arrow(390, 170, 530, 170, "uses, to reach an API"))

from secplus_illustrations import ILLUSTRATIONS  # noqa: E402  the illustrations for harder concepts

clash = set(D) & set(ILLUSTRATIONS)
if clash:
    raise SystemExit(f"two pictures share a name: {sorted(clash)}")
boxes = len(D)
D.update(ILLUSTRATIONS)
OUT.write_text(json.dumps(D, ensure_ascii=False), encoding="utf-8")
print(f"{boxes} diagrams and {len(ILLUSTRATIONS)} illustrations")
