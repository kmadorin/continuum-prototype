#!/usr/bin/env python3
"""Generate continuum-user-story-map.excalidraw (Excalidraw schema v2).

NOTE (2026-06-24): THIS SCRIPT is the canonical source for the .excalidraw —
it emits proper bound-text elements (containerId), which render and wrap
correctly in real Excalidraw / excalidraw.com. Do NOT export the map from the
excalidraw MCP `export_scene` / `export_to_excalidraw_url`: that path drops the
bound labels (the MCP keeps card text in an internal `label` field it does not
serialize), producing boxes with no text. Edit content here and re-run.

Patton method:
  - Backbone = activities, left->right = sequence (the deal, step by step).
  - Release = horizontal band (vertical position).  R1 walking skeleton on top.
  - Persona = CARD COLOUR + an UPPERCASE actor tag on the first line.
  - Multi-actor steps get one card PER actor, stacked in the column.
  - Every activity has an R1 task -> R1 is a complete, demoable product.
"""
import json, random, string, os, textwrap

def wrap(s, width):
    # pre-wrap with explicit newlines so text renders multi-line in any
    # renderer (the excalidraw MCP import drops bound-text auto-wrap).
    return "\n".join(textwrap.fill(line, width=width) for line in s.split("\n"))

def rid(n=16):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=n))
def nonce():
    return random.randint(1, 2_000_000_000)

elements = []

# ---- personas: key -> (fill, stroke, label) ----
P = {
    "ADVISOR":   ("#a5d8ff", "#1971c2"),
    "STAY":      ("#b2f2bb", "#2f9e44"),
    "LEAVE":     ("#ffd8a8", "#e8590c"),
    "BUYER":     ("#eebefa", "#9c36b5"),
    "OVERSIGHT": ("#99e9f2", "#0c8599"),
    "SYS":       ("#e9ecef", "#868e96"),
}

# ---- layout ----
W = 230
PITCH = 262
COLS = [250 + i * PITCH for i in range(10)]
RIGHT = COLS[-1] + W
BAND_W = RIGHT - 20 + 24
LBLX, LBLW = 24, 214
Y_BB, H_BB = 182, 74
CH = 116                      # card height (fits 4 lines @12px, no clip/grow)
GAP = 14
Y_R1 = 300
Y_R1b = Y_R1 + CH + GAP       # 430
R1_BAND_Y, R1_BAND_H = 288, 272
Y_R2, R2_BAND_Y, R2_BAND_H = 584, 572, 140
Y_R3, R3_BAND_Y, R3_BAND_H = 736, 724, 140

def rect(x, y, w, h, fill, stroke, text=None, fontSize=13, opacity=100,
         dashed=False, text_color="#1e1e1e", roundness=True, bold=False):
    cid = rid()
    elements.append({
        "id": cid, "type": "rectangle", "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": stroke, "backgroundColor": fill,
        "fillStyle": "solid", "strokeWidth": 1.5,
        "strokeStyle": "dashed" if dashed else "solid",
        "roughness": 1, "opacity": opacity, "groupIds": [], "frameId": None,
        "roundness": {"type": 3} if roundness else None,
        "seed": nonce(), "versionNonce": nonce(), "version": 1,
        "isDeleted": False, "boundElements": [], "updated": 1, "link": None, "locked": False,
    })
    if text:
        tid = rid()
        elements[-1]["boundElements"] = [{"type": "text", "id": tid}]
        elements.append({
            "id": tid, "type": "text", "x": x + 8, "y": y + 8,
            "width": w - 16, "height": h - 16, "angle": 0,
            "strokeColor": text_color, "backgroundColor": "transparent",
            "fillStyle": "solid", "strokeWidth": 1.5, "strokeStyle": "solid",
            "roughness": 1, "opacity": 100, "groupIds": [], "frameId": None,
            "roundness": None, "seed": nonce(), "versionNonce": nonce(), "version": 1,
            "isDeleted": False, "boundElements": [], "updated": 1, "link": None, "locked": False,
            "text": text, "fontSize": fontSize, "fontFamily": 2,
            "textAlign": "center", "verticalAlign": "middle",
            "containerId": cid, "originalText": text, "lineHeight": 1.2, "baseline": fontSize,
        })

def text(x, y, s, fontSize=16, color="#1e1e1e", fontFamily=2, opacity=100):
    elements.append({
        "id": rid(), "type": "text", "x": x, "y": y,
        "width": len(s) * fontSize * 0.55, "height": fontSize * 1.25, "angle": 0,
        "strokeColor": color, "backgroundColor": "transparent", "fillStyle": "solid",
        "strokeWidth": 1.5, "strokeStyle": "solid", "roughness": 1, "opacity": opacity,
        "groupIds": [], "frameId": None, "roundness": None, "seed": nonce(),
        "versionNonce": nonce(), "version": 1, "isDeleted": False, "boundElements": [],
        "updated": 1, "link": None, "locked": False, "text": s, "fontSize": fontSize,
        "fontFamily": fontFamily, "textAlign": "left", "verticalAlign": "top",
        "containerId": None, "originalText": s, "lineHeight": 1.25, "baseline": fontSize,
    })

def arrow(x, y, w, color="#868e96"):
    elements.append({
        "id": rid(), "type": "arrow", "x": x, "y": y, "width": w, "height": 0, "angle": 0,
        "strokeColor": color, "backgroundColor": "transparent", "fillStyle": "solid",
        "strokeWidth": 1.5, "strokeStyle": "solid", "roughness": 1, "opacity": 100,
        "groupIds": [], "frameId": None, "roundness": {"type": 2}, "seed": nonce(),
        "versionNonce": nonce(), "version": 1, "isDeleted": False, "boundElements": [],
        "updated": 1, "link": None, "locked": False,
        "points": [[0, 0], [w, 0]], "lastCommittedPoint": None,
        "startBinding": None, "endBinding": None, "startArrowhead": None, "endArrowhead": "arrow",
    })

def card(x, y, actor, task):
    fill, stroke = P[actor]
    rect(x, y, W, CH, fill, stroke, f"{actor.replace('_',' ')}\n{wrap(task, 32)}", fontSize=12)

# ---- band backgrounds ----
rect(20, 140, BAND_W, 110, "#f1f3f5", "#adb5bd", opacity=40, roundness=False)
rect(20, R1_BAND_Y, BAND_W, R1_BAND_H, "#b2f2bb", "#2f9e44", opacity=14, dashed=True, roundness=False)
rect(20, R2_BAND_Y, BAND_W, R2_BAND_H, "#ffd8a8", "#e8590c", opacity=14, dashed=True, roundness=False)
rect(20, R3_BAND_Y, BAND_W, R3_BAND_H, "#eebefa", "#9c36b5", opacity=14, dashed=True, roundness=False)

# ---- title + legend ----
text(20, 18, "Continuum — User Story Map", 30, "#1e1e1e", 7)
text(22, 58, "GP-led continuation deals · Jeff Patton story map · backbone = sequence (left→right) · release = band (top→bottom) · CARD COLOUR = who acts", 14, "#868e96")
text(24, 92, "WHO ACTS:", 12, "#1e1e1e", 3)
leg = [("ADVISOR", "Advisor / Organizer"), ("STAY", "Investor — Staying"), ("LEAVE", "Investor — Leaving"),
       ("BUYER", "Buyer"), ("OVERSIGHT", "Oversight / Reg."), ("SYS", "System / All")]
lx = 130
for k, lbl in leg:
    fill, stroke = P[k]
    rect(lx, 84, 188, 26, fill, stroke, lbl, fontSize=11)
    lx += 198

# ---- timeline arrow over the backbone ----
arrow(COLS[0], 168, COLS[-1] + W - COLS[0])
text(COLS[-1] + W - 70, 150, "time →", 12, "#868e96", 3)

# ---- left band labels ----
rect(LBLX, Y_BB, LBLW, H_BB, "#ced4da", "#343a40", "ACTIVITIES — the deal, step by step", 13, bold=True)
rect(LBLX, R1_BAND_Y, LBLW, R1_BAND_H, "#b2f2bb", "#2f9e44",
     "R1 · WALKING SKELETON\nComplete, demoable product.\nOne deal closes end-to-end.\nEvery step has an R1 task.", 12)
rect(LBLX, R2_BAND_Y, LBLW, R2_BAND_H, "#ffd8a8", "#e8590c", "RELEASE 2\nReal & repeatable\n(enhances R1)", 12)
rect(LBLX, R3_BAND_Y, LBLW, R3_BAND_H, "#eebefa", "#9c36b5", "RELEASE 3\nNetwork / platform\n(enhances R1)", 12)

# ---- backbone activities ----
backbone = ["1. Set up the deal room", "2. Bring participants in", "3. Price the deal",
            "4. LPAC consents (pre-close gate)", "5. Decide: roll or sell",
            "6. Work out who gets what", "7. Approve my part", "8. Close — all at once",
            "9. Prove it was fair", "10. Do the next deal faster"]
for x, t in zip(COLS, backbone):
    rect(x, Y_BB, W, H_BB, "#ced4da", "#343a40", wrap(t, 24), 15)

# ---- R1 cards (actor, task), stacked per activity ----
R1 = {
    0: [("ADVISOR", "Create the room; name fund, vehicle, asset & reference NAV")],
    1: [("ADVISOR", "Invite the LPs & buyer to the room"),
        ("BUYER", "Get verified once — reusable eligibility")],
    2: [("BUYER", "Sealed priced bid to win lead — blind to other finalists"),
        ("ADVISOR", "Select the lead; lead sets the price; syndicate joins at lead price; fairness opinion on file (supports LPAC)")],
    3: [("OVERSIGHT", "Review conflict + fairness + terms package; consent (>=10 biz days) — gates elections; recuse if conflicted")],
    4: [("STAY", "Privately ROLL or STATUS-QUO (unchanged terms) at the set price"),
        ("LEAVE", "Privately SELL — default if nothing filed; >=30-day window; never forced to roll")],
    5: [("SYS", "Size the allocation from the elections at the set price"),
        ("ADVISOR", "Review the computed close")],
    6: [("BUYER", "Approve the cash leg"),
        ("STAY", "LP / vehicle approve units & asset legs")],
    7: [("ADVISOR", "Trigger the close — one click"),
        ("SYS", "All legs settle together; each sees only its own")],
    8: [("OVERSIGHT", "Open the scoped, after-the-fact fairness view")],
    9: [("BUYER", "Reuse verification → bid in one click (deal #2)")],
}
for i, cards in R1.items():
    for j, (actor, task) in enumerate(cards):
        card(COLS[i], Y_R1 + j * (CH + GAP), actor, task)

# ---- R2 cards ----
R2 = {
    0: ("ADVISOR", "Set an election deadline; invite many LPs & buyers"),
    1: ("SYS", "Self-serve logins & per-party dashboards"),
    2: ("BUYER", "Sealed-bid auction — finalists blind; advisor selects lead; syndicate at lead price"),
    3: ("OVERSIGHT", "Conflicted LPAC member recuses; >=10 biz-day review window"),
    4: ("STAY", "Split roll / status-quo / sell; amend before deadline; default = sell"),
    5: ("SYS", "Pro-rata + syndicate fills overflow at lead price; preview"),
    6: ("ADVISOR", "Decline to proceed (broken-deal); or cancel a leg before close"),
    7: ("ADVISOR", "Force a leg to fail → nothing moves (atomicity)"),
    8: ("OVERSIGHT", "Structured fairness report"),
}
for i, (actor, task) in R2.items():
    card(COLS[i], Y_R2, actor, task)

# ---- R3 cards ----
R3 = {
    0: ("ADVISOR", "Reuse a past deal as a template"),
    1: ("BUYER", "Verified buyer reused across organizers"),
    8: ("OVERSIGHT", "Cross-organization disclosure"),
    9: ("SYS", "Bid into many deals; new deal types (tenders, buybacks)"),
}
for i, (actor, task) in R3.items():
    card(COLS[i], Y_R3, actor, task)

scene = {
    "type": "excalidraw", "version": 2, "source": "continuum-story-map-generator",
    "elements": elements,
    "appState": {"gridSize": 20, "viewBackgroundColor": "#ffffff"},
    "files": {},
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "continuum-user-story-map.excalidraw")
with open(out, "w") as f:
    json.dump(scene, f, indent=2, ensure_ascii=False)
print(f"wrote {out}  ({len(elements)} elements)")
