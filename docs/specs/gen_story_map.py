#!/usr/bin/env python3
"""Generate continuum-user-story-map.excalidraw (Excalidraw schema v2)."""
import json, random, string

def rid(n=16):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=n))

def nonce():
    return random.randint(1, 2_000_000_000)

elements = []

# --- layout constants ---
W = 210               # card width
PITCH = 250           # column pitch (W + 40px gap)
COLS = [240 + i * PITCH for i in range(9)]   # 240,490,...,2240
RIGHT = COLS[-1] + W                          # 2450
BAND_W = RIGHT - 20 + 20                       # full-width band
LBL_X, LBL_W = 28, 196
# row tops / heights
Y_BB, H_BB = 150, 80          # backbone
Y_R1, H_R1 = 270, 84          # release 1
Y_R2, H_R2 = 394, 84          # release 2
Y_R3, H_R3 = 518, 84          # release 3

def rect(x, y, w, h, fill, stroke, text=None, fontSize=14, opacity=100,
         dashed=False, text_color="#1e1e1e", roundness=True):
    cid = rid()
    r = {
        "id": cid, "type": "rectangle", "x": x, "y": y, "width": w, "height": h,
        "angle": 0, "strokeColor": stroke, "backgroundColor": fill,
        "fillStyle": "solid", "strokeWidth": 1.5,
        "strokeStyle": "dashed" if dashed else "solid",
        "roughness": 1, "opacity": opacity, "groupIds": [], "frameId": None,
        "roundness": {"type": 3} if roundness else None,
        "seed": nonce(), "versionNonce": nonce(), "version": 1,
        "isDeleted": False, "boundElements": [], "updated": 1, "link": None, "locked": False,
    }
    elements.append(r)
    if text:
        tid = rid()
        r["boundElements"] = [{"type": "text", "id": tid}]
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
            "containerId": cid, "originalText": text, "lineHeight": 1.25, "baseline": fontSize,
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

# --- band backgrounds (drawn first = behind) ---
rect(20, 140, BAND_W, 100, "#f1f3f5", "#adb5bd", opacity=40, roundness=False)
rect(20, Y_R1 - 10, BAND_W, H_R1 + 20, "#b2f2bb", "#2f9e44", opacity=18, dashed=True, roundness=False)
rect(20, Y_R2 - 10, BAND_W, H_R2 + 20, "#ffd8a8", "#e8590c", opacity=18, dashed=True, roundness=False)
rect(20, Y_R3 - 10, BAND_W, H_R3 + 20, "#eebefa", "#9c36b5", opacity=18, dashed=True, roundness=False)

# --- titles ---
text(20, 18, "Continuum — User Story Map", 30, "#1e1e1e", 7)
text(22, 58, "GP-led continuation deals · product story map (Jeff Patton) · narrative left→right, releases top→bottom", 15, "#868e96")

# --- persona legend: aligned to columns 1-5, label in left gutter ---
text(28, 88, "Personas:", 14)
personas = [("Advisor / Organizer", "#a5d8ff", "#1971c2"), ("Investor — Staying", "#b2f2bb", "#2f9e44"),
            ("Investor — Leaving", "#ffd8a8", "#e8590c"), ("Buyer", "#eebefa", "#9c36b5"),
            ("Oversight / Regulator", "#99e9f2", "#0c8599")]
for (t, fill, stroke), x in zip(personas, COLS):
    rect(x, 78, W, 38, fill, stroke, t, 13)

# --- left row labels ---
rect(LBL_X, Y_BB, LBL_W, H_BB, "#dee2e6", "#495057", "ACTIVITIES (backbone) — what users do, in order", 13)
rect(LBL_X, Y_R1, LBL_W, H_R1, "#b2f2bb", "#2f9e44", "RELEASE 1\nWalking skeleton —\none deal closes", 13)
rect(LBL_X, Y_R2, LBL_W, H_R2, "#ffd8a8", "#e8590c", "RELEASE 2\nReal & repeatable", 13)
rect(LBL_X, Y_R3, LBL_W, H_R3, "#eebefa", "#9c36b5", "RELEASE 3\nThe network / platform", 13)

# --- backbone activities ---
backbone = ["1. Set up the deal room", "2. Bring participants in", "3. Decide: stay or cash out",
            "4. Make a private offer", "5. Work out who gets what", "6. Approve my part",
            "7. Close — all at once", "8. Prove it was fair", "9. Do the next deal faster"]
for x, t in zip(COLS, backbone):
    rect(x, Y_BB, W, H_BB, "#a5d8ff", "#1971c2", t, 15)

# --- R1 walking skeleton ---
r1 = ["Create the room; name the fund & terms", "Invite investors & buyer; verify the buyer once",
      "Privately choose: roll or exit", "Privately submit amount & price",
      "System works out who gets what", "Approve only my own obligation",
      "One click — cash, units & asset move together", "Oversight gets a scoped, after-the-fact view",
      "Deal #2: returning buyer offers in one click"]
for x, t in zip(COLS, r1):
    rect(x, Y_R1, W, H_R1, "#d3f9d8", "#2f9e44", t, 14)

# --- R2 ---
r2 = ["Set an election deadline; many investors & buyers", "Self-serve logins & dashboards",
      "Split roll / exit; change before the deadline", "Blocked if unverified; many buyers bid blind",
      "Pro-rata allocation; preview before close", "Cancel or withdraw before close",
      "Forced-failure demo → nothing moves", "Structured fairness report", None]
for x, t in zip(COLS, r2):
    if t:
        rect(x, Y_R2, W, H_R2, "#ffe8cc", "#e8590c", t, 14)

# --- R3 ---
r3 = {0: "Reuse a past deal as a template", 1: "Verified buyer reused across organizers",
      7: "Cross-organization disclosure", 8: "Bid into many deals; new deal types (tenders, buybacks)"}
for i, t in r3.items():
    rect(COLS[i], Y_R3, W, H_R3, "#f3d9fa", "#9c36b5", t, 14)

# --- R3 note filling the empty span (between cols 2 and 7) ---
text(COLS[2] + 60, Y_R3 + 26, "Future deal types & cross-organization features\nbuild on the same closing engine",
     16, "#9c36b5", fontFamily=5, opacity=65)

scene = {
    "type": "excalidraw", "version": 2, "source": "continuum-story-map-generator",
    "elements": elements,
    "appState": {"gridSize": 20, "viewBackgroundColor": "#ffffff"},
    "files": {},
}

out = "/Users/kirillmadorin/Projects/hackathons/canton/continuum/docs/specs/continuum-user-story-map.excalidraw"
with open(out, "w") as f:
    json.dump(scene, f, indent=2, ensure_ascii=False)
print(f"wrote {out}  ({len(elements)} elements)")
