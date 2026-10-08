#!/usr/bin/env python3
"""Generate a demo history file for testing V2 historical replay.

Builds a fictional 3-hour search on the real Bunmahon access routes from
data/bunmahon-latest.umap: three teams walk out to the cliff edges and
back, mark zones, post Cleared pins, and stand down when the casualty is
found. Output matches the archive format the replay mode reads:

  { "meta": {...},
    "events": [ {"t": ms, "kind": "post" | "delete", "id": ..., "alert": {...}} ],
    "frames": [ {"t": ms, "users": [ {userId, displayName, team, lat, lng, timestamp} ]} ] }

Deterministic (fixed seed), so re-running gives the same file.
Usage: python3 tools/generate-replay-demo.py [output.json]
"""
import json
import math
import random
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "replay-demo.json"

random.seed(20261004)
START = int(datetime(2026, 10, 4, 13, 0, tzinfo=timezone.utc).timestamp() * 1000)  # 14:00 Irish time
MIN = 60_000
FRAME_EVERY = 30_000
DURATION = 180 * MIN
STAND_DOWN = 150 * MIN
WALK = 1.2      # m/s on paths
TRANSFER = 1.4  # m/s between routes and back to muster
PAUSE = 4 * MIN  # searching at each cliff edge
MUSTER = (52.13975, -7.36410)  # lat, lng: Bunmahon beach car park area

# --- routes from the real uMap file -------------------------------------
umap = json.loads((ROOT / "data" / "bunmahon-latest.umap").read_text())
ROUTES, ZONE_ALPHA = {}, None
for layer in umap["layers"]:
    for f in layer["features"]:
        g, name = f["geometry"], f.get("properties", {}).get("name")
        if g["type"] == "LineString":
            ROUTES[name] = [(lat, lng) for lng, lat in g["coordinates"]]
        elif g["type"] == "Polygon" and name == "team alpha":
            ZONE_ALPHA = [[lat, lng] for lng, lat in g["coordinates"][0][:-1]]


def metres(a, b):
    dlat = (b[0] - a[0]) * 111_320
    dlng = (b[1] - a[1]) * 111_320 * math.cos(math.radians(a[0]))
    return math.hypot(dlat, dlng)


def ms(minutes):
    return START + int(minutes * MIN)


def iso(t):
    return datetime.fromtimestamp(t / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class Plan:
    """A member's timeline: list of (t, lat, lng) waypoints, interpolated."""

    def __init__(self, t0, pos):
        self.pts = [(t0, *pos)]

    @property
    def end(self):
        return self.pts[-1]

    def go(self, dest, speed):
        t, lat, lng = self.end
        self.pts.append((t + int(metres((lat, lng), dest) / speed * 1000), *dest))

    def walk(self, path, speed):
        for p in path:
            self.go(p, speed)

    def wait(self, dur):
        t, lat, lng = self.end
        self.pts.append((t + dur, lat, lng))

    def at(self, t):
        pts = self.pts
        if t <= pts[0][0]:
            return pts[0][1:]
        for (t0, a0, b0), (t1, a1, b1) in zip(pts, pts[1:]):
            if t <= t1:
                k = 0 if t1 == t0 else (t - t0) / (t1 - t0)
                return (a0 + (a1 - a0) * k, b0 + (b1 - b0) * k)
        return pts[-1][1:]


TEAMS = {
    "Alpha": {"routes": ["WR1", "WR2", "WR3", "CAP1"], "members": ["Aoife", "Ciaran", "Niamh"]},
    "Bravo": {"routes": ["ER1", "ER2", "ER7", "ER8"], "members": ["Declan", "Siobhan", "Padraig"]},
    "Charlie": {"routes": ["WR4", "WR5", "WR6", "WR7", "WR8"], "members": ["Sean", "Grainne"]},
}

events = []


def post(t, category, message, user, team="", **extra):
    alert = {"id": str(uuid.UUID(int=random.getrandbits(128))), "message": message, "category": category,
             "user": user, "team": team, "timestamp": iso(t), **extra}
    events.append({"t": t, "kind": "post", "id": alert["id"], "alert": alert})
    return alert["id"]


def delete(t, alert_id):
    events.append({"t": t, "kind": "delete", "id": alert_id})


# --- control posts -------------------------------------------------------
post(ms(0), "Scenario", "Missing walker reported. Last seen on the cliff path west of Bunmahon beach around 12:30.", "Control")
post(ms(3), "Description", "Male, late 60s, red jacket, grey hat, walking a black Labrador.", "Control")

# --- members -------------------------------------------------------------
members = []  # (userId, name, team-over-time, plan, start_t)
for ti, (team, cfg) in enumerate(TEAMS.items()):
    for mi, name in enumerate(cfg["members"]):
        start = ms(2 + ti * 3 + mi * 1.5)
        jitter = (random.uniform(-0.00006, 0.00006), random.uniform(-0.00009, 0.00009))
        plan = Plan(start, (MUSTER[0] + jitter[0], MUSTER[1] + jitter[1]))
        plan.wait(random.randint(60, 180) * 1000)
        lag = mi * random.randint(20, 45) * 1000
        plan.wait(lag)
        loop = 0
        while plan.end[0] < STAND_DOWN + START:
            for r in cfg["routes"]:
                path = [(lat + jitter[0], lng + jitter[1]) for lat, lng in ROUTES[r]]
                plan.go(path[0], TRANSFER)
                plan.walk(path[1:], WALK)
                if mi == 0 and loop == 0 and plan.end[0] < START + STAND_DOWN:
                    t_clear, lat, lng = plan.end
                    post(t_clear + 60_000, "Cleared", f"Cliff edge at end of {r}, Co. Waterford", name, team,
                         lat=round(lat, 6), lng=round(lng, 6))
                plan.wait(PAUSE)
                plan.walk(list(reversed(path[:-1])), WALK)
            loop += 1
        uid = str(uuid.UUID(int=random.getrandbits(128)))
        members.append({"userId": uid, "name": name, "team": team, "plan": plan, "start": start})
        post(start, "Team", f"{name} has joined {team}", "System", team)

# Padraig goes off duty partway through: walks back to muster and drops off the map
padraig = next(m for m in members if m["name"] == "Padraig")
PADRAIG_LEAVES = ms(120)
post(PADRAIG_LEAVES, "Team", "Padraig has left Bravo", "System", "")

# --- zones, sighting, stand down -----------------------------------------
alpha_zone = post(ms(15), "Zone", "Alpha search area: beach to WR3", "Aoife", "Alpha",
                  points=ZONE_ALPHA, lat=round(sum(p[0] for p in ZONE_ALPHA) / len(ZONE_ALPHA), 6),
                  lng=round(sum(p[1] for p in ZONE_ALPHA) / len(ZONE_ALPHA), 6))
bravo_pts = [[52.13905, -7.35420], [52.13910, -7.34180], [52.13800, -7.34200], [52.13770, -7.35360]]
post(ms(24), "Zone", "Bravo search area: ER1 to ER2", "Declan", "Bravo", points=bravo_pts,
     lat=52.13846, lng=-7.34790)
wr6_end = ROUTES["WR6"][-1]
post(ms(72), "Sighting", "Member of the public reports a black Labrador near the end of WR6, heading west.", "Control",
     lat=round(wr6_end[0], 5), lng=round(wr6_end[1] - 0.0015, 5))  # ~100 m west of the route end
delete(ms(100), alpha_zone)  # Alpha area searched and removed
charlie_pts = [[52.13360, -7.39380], [52.13460, -7.38700], [52.13180, -7.38650], [52.13020, -7.39250]]
post(ms(108), "Zone", "Charlie priority area: WR7 to WR8", "Grainne", "Charlie", points=charlie_pts,
     lat=52.13255, lng=-7.38995)
post(ms(STAND_DOWN / MIN), "Other", "Casualty located safe near WR8 by Charlie. All teams stand down and return to muster.", "Control")

# --- frames --------------------------------------------------------------
frames = []
for t in range(START, START + DURATION + 1, FRAME_EVERY):
    users = []
    for m in members:
        if t < m["start"]:
            continue
        p = m["plan"]
        recall = PADRAIG_LEAVES if m is padraig else START + STAND_DOWN
        team = m["team"]
        if t <= recall:
            lat, lng = p.at(t)
        else:  # head straight back to muster
            here = p.at(recall)
            dist = metres(here, MUSTER)
            k = min(1.0, (t - recall) / 1000 * TRANSFER / dist) if dist else 1.0
            lat, lng = here[0] + (MUSTER[0] - here[0]) * k, here[1] + (MUSTER[1] - here[1]) * k
            if m is padraig:
                if k >= 1.0 and t - recall > dist / TRANSFER * 1000 + 2 * MIN:
                    continue  # back at muster and signed off
                team = ""
        users.append({"userId": m["userId"], "displayName": m["name"], "team": team,
                      "lat": round(lat, 6), "lng": round(lng, 6), "timestamp": t})
    frames.append({"t": t, "users": users})

events.sort(key=lambda e: e["t"])
out = {"meta": {"name": "Demo: missing walker, Bunmahon cliffs", "start": START, "end": START + DURATION,
                "generatedBy": "tools/generate-replay-demo.py"},
       "events": events, "frames": frames}
OUT.write_text(json.dumps(out, separators=(",", ":")))
print(f"{OUT}: {len(events)} events, {len(frames)} frames, {OUT.stat().st_size / 1024:.0f} KB")
