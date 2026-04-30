#!/usr/bin/env python3
"""
Fetch Pure Blind + Fade system/constellation data from ESI and generate
a constellation-aware 2D layout for timerviz/map-data.json.

Run: python scripts/build_map_data.py

ESI data is cached in scripts/esi-cache.json so subsequent runs
(e.g. to tweak layout params) don't re-fetch.
"""

import json
import math
import os
import time
import sys

import requests

# ── Config ────────────────────────────────────────────────────────────────────

REGIONS = [
    {"id": 10000046, "name": "Fade",       "color": "#8957e5"},
    {"id": 10000023, "name": "Pure Blind", "color": "#1f6feb"},
]

ESI = "https://esi.evetech.net/latest"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(SCRIPT_DIR, "esi-cache.json")
OUT_FILE   = os.path.join(SCRIPT_DIR, "..", "timerviz", "static", "timerviz", "map-data.json")

# Layout tuning
BUBBLE_RADIUS    = 0.075   # how large each constellation cluster is (fraction of map)
MIN_CONST_DIST   = 0.22    # minimum distance between constellation centers
EDGE_REST        = 0.26    # rest length for inter-constellation spring
EDGE_K           = 0.012   # spring stiffness
ANCHOR_PULL      = 0.18    # pull back to EVE-coordinate-derived anchor
ITERS            = 350     # force-directed iterations
SEP_ITERS        = 150     # separation-only cleanup passes


# ── ESI fetch with caching ────────────────────────────────────────────────────

def load_cache():
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_FILE, "w") as f:
        json.dump(cache, f, indent=2)

_cache = load_cache()

def get(url):
    if url in _cache:
        return _cache[url]
    print(f"  ESI {url.replace(ESI, '')}", flush=True)
    r = requests.get(url, timeout=20)
    r.raise_for_status()
    data = r.json()
    _cache[url] = data
    save_cache(_cache)
    time.sleep(0.06)
    return data


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_all():
    systems = {}       # id -> dict
    constellations = {}  # id -> dict
    edges = set()      # (min_id, max_id)

    for reg in REGIONS:
        print(f"\nFetching region: {reg['name']}", flush=True)
        region = get(f"{ESI}/universe/regions/{reg['id']}/")

        for cid in region["constellations"]:
            c = get(f"{ESI}/universe/constellations/{cid}/")
            constellations[cid] = {
                "id":         cid,
                "name":       c["name"],
                "regionId":   reg["id"],
                "regionName": reg["name"],
                "color":      reg["color"],
                "systems":    c["systems"],
            }
            for sid in c["systems"]:
                s = get(f"{ESI}/universe/systems/{sid}/")
                systems[sid] = {
                    "id":               sid,
                    "name":             s["name"],
                    "x":                s["position"]["x"],
                    "y":                s["position"]["y"],
                    "z":                s["position"]["z"],
                    "regionId":         reg["id"],
                    "regionName":       reg["name"],
                    "regionColor":      reg["color"],
                    "constellationId":  cid,
                    "constellationName": c["name"],
                    "stargates":        s.get("stargates", []),
                }

    print(f"\nFetching stargates for {len(systems)} systems…", flush=True)
    for sys in systems.values():
        for gid in sys["stargates"]:
            g = get(f"{ESI}/universe/stargates/{gid}/")
            dest = g["destination"]["system_id"]
            if dest not in systems:
                continue
            edges.add((min(sys["id"], dest), max(sys["id"], dest)))

    return systems, constellations, edges


# ── Layout ────────────────────────────────────────────────────────────────────

def clamp(v, lo=0.01, hi=0.99):
    return max(lo, min(hi, v))

def build_layout(systems, constellations, edges):
    # Step 1: Constellation centroids from EVE XZ coordinates
    const_pos = {}   # cid -> [x, z] in EVE space
    for cid, c in constellations.items():
        sids = [s for s in c["systems"] if s in systems]
        if not sids:
            continue
        cx = sum(systems[s]["x"] for s in sids) / len(sids)
        cz = sum(systems[s]["z"] for s in sids) / len(sids)
        const_pos[cid] = [cx, cz]

    # Step 2: Normalize constellation centroids to [0.05, 0.95]
    all_cx = [p[0] for p in const_pos.values()]
    all_cz = [p[1] for p in const_pos.values()]
    min_cx, max_cx = min(all_cx), max(all_cx)
    min_cz, max_cz = min(all_cz), max(all_cz)
    w = max_cx - min_cx or 1
    h = max_cz - min_cz or 1
    span = max(w, h)

    # Use XZ projection (Z flipped to match screen coords: larger Z = higher on map)
    pad = 0.1
    for cid in const_pos:
        cx, cz = const_pos[cid]
        nx = pad + ((cx - min_cx) / span) * (1 - 2 * pad)
        ny = pad + (1 - (cz - min_cz) / span) * (1 - 2 * pad)
        const_pos[cid] = [nx, ny]

    # Step 3: Inter-constellation edge graph
    const_edges = set()
    for a, b in edges:
        ca = systems[a]["constellationId"]
        cb = systems[b]["constellationId"]
        if ca != cb:
            const_edges.add((min(ca, cb), max(ca, cb)))

    # Step 4: Force-directed layout at constellation level
    cids = list(const_pos.keys())
    anchors = {cid: list(const_pos[cid]) for cid in cids}
    pos = {cid: list(const_pos[cid]) for cid in cids}

    for iteration in range(ITERS + SEP_ITERS):
        use_springs = iteration < ITERS

        # Pairwise separation
        for i in range(len(cids)):
            for j in range(i + 1, len(cids)):
                ca, cb = cids[i], cids[j]
                dx = pos[cb][0] - pos[ca][0]
                dy = pos[cb][1] - pos[ca][1]
                dist = math.hypot(dx, dy) or 1e-9
                if dist < MIN_CONST_DIST:
                    push = (MIN_CONST_DIST - dist) * 0.55
                    ux, uy = dx / dist, dy / dist
                    pos[ca][0] -= ux * push
                    pos[ca][1] -= uy * push
                    pos[cb][0] += ux * push
                    pos[cb][1] += uy * push

        if use_springs:
            # Edge springs (attract connected constellations)
            for ca, cb in const_edges:
                if ca not in pos or cb not in pos:
                    continue
                dx = pos[cb][0] - pos[ca][0]
                dy = pos[cb][1] - pos[ca][1]
                dist = math.hypot(dx, dy) or 1e-9
                diff = dist - EDGE_REST
                f = EDGE_K * diff
                fx, fy = (dx / dist) * f, (dy / dist) * f
                pos[ca][0] += fx;  pos[ca][1] += fy
                pos[cb][0] -= fx;  pos[cb][1] -= fy

            # Anchor pull — preserves EVE topology
            for cid in cids:
                pos[cid][0] += (anchors[cid][0] - pos[cid][0]) * ANCHOR_PULL
                pos[cid][1] += (anchors[cid][1] - pos[cid][1]) * ANCHOR_PULL

        for cid in cids:
            pos[cid][0] = clamp(pos[cid][0], 0.05, 0.95)
            pos[cid][1] = clamp(pos[cid][1], 0.05, 0.95)

    # Step 5: Place systems within constellation bubble
    for sid, sys in systems.items():
        cid = sys["constellationId"]
        sids_in_const = [s for s in constellations[cid]["systems"] if s in systems]

        if len(sids_in_const) == 1:
            sys["nx"], sys["ny"] = pos[cid]
            continue

        # Normalize system within constellation using EVE XZ
        c_xs = [systems[s]["x"] for s in sids_in_const]
        c_zs = [systems[s]["z"] for s in sids_in_const]
        c_minx, c_maxx = min(c_xs), max(c_xs)
        c_minz, c_maxz = min(c_zs), max(c_zs)
        c_span = max(c_maxx - c_minx, c_maxz - c_minz) or 1

        # Local offset in [-BUBBLE_RADIUS, +BUBBLE_RADIUS]
        lx = ((sys["x"] - c_minx) / c_span - 0.5) * 2 * BUBBLE_RADIUS
        ly = -((sys["z"] - c_minz) / c_span - 0.5) * 2 * BUBBLE_RADIUS

        sys["nx"] = pos[cid][0] + lx
        sys["ny"] = pos[cid][1] + ly

    # Step 6: System-level separation pass (avoid overlapping nodes)
    sys_list = list(systems.values())
    MIN_SYS_DIST = 0.048
    for _ in range(120):
        for i in range(len(sys_list)):
            for j in range(i + 1, len(sys_list)):
                dx = sys_list[j]["nx"] - sys_list[i]["nx"]
                dy = sys_list[j]["ny"] - sys_list[i]["ny"]
                dist = math.hypot(dx, dy) or 1e-9
                if dist < MIN_SYS_DIST:
                    push = (MIN_SYS_DIST - dist) * 0.45
                    ux, uy = dx / dist, dy / dist
                    sys_list[i]["nx"] -= ux * push * 0.5
                    sys_list[i]["ny"] -= uy * push * 0.5
                    sys_list[j]["nx"] += ux * push * 0.5
                    sys_list[j]["ny"] += uy * push * 0.5

    # Step 7: Final normalize to [0.04, 0.96]
    all_nx = [s["nx"] for s in sys_list]
    all_ny = [s["ny"] for s in sys_list]
    min_nx, max_nx = min(all_nx), max(all_nx)
    min_ny, max_ny = min(all_ny), max(all_ny)
    span = max(max_nx - min_nx, max_ny - min_ny) or 1
    cx_all = (min_nx + max_nx) / 2
    cy_all = (min_ny + max_ny) / 2
    pad = 0.05
    scale = (1 - 2 * pad) / span

    for s in sys_list:
        s["nx"] = clamp(0.5 + (s["nx"] - cx_all) * scale, 0.04, 0.96)
        s["ny"] = clamp(0.5 + (s["ny"] - cy_all) * scale, 0.04, 0.96)

    # Also update constellation center positions for the output
    for cid in pos:
        pos[cid][0] = clamp(0.5 + (pos[cid][0] - cx_all) * scale, 0.04, 0.96)
        pos[cid][1] = clamp(0.5 + (pos[cid][1] - cy_all) * scale, 0.04, 0.96)

    return pos


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=== timerviz map data builder ===")
    systems, constellations, edges = fetch_all()
    print(f"\nLayout: {len(systems)} systems, {len(constellations)} constellations, {len(edges)} edges")

    const_centers = build_layout(systems, constellations, edges)

    # Build region color map
    region_colors = {r["name"]: r["color"] for r in REGIONS}

    out = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "regions": REGIONS,
        "constellations": {
            str(cid): {
                "id":          cid,
                "name":        c["name"],
                "regionId":    c["regionId"],
                "regionName":  c["regionName"],
                "color":       region_colors.get(c["regionName"], "#ffffff"),
                "centerNx":    round(const_centers.get(cid, [0.5])[0], 6),
                "centerNy":    round(const_centers.get(cid, [0.5, 0.5])[1], 6),
            }
            for cid, c in constellations.items()
        },
        "systems": [
            {
                "id":               s["id"],
                "name":             s["name"],
                "regionId":         s["regionId"],
                "regionName":       s["regionName"],
                "regionColor":      s["regionColor"],
                "constellationId":  s["constellationId"],
                "constellationName": s["constellationName"],
                "nx":               round(s["nx"], 6),
                "ny":               round(s["ny"], 6),
            }
            for s in sorted(systems.values(), key=lambda x: x["id"])
        ],
        "edges": [{"a": a, "b": b} for a, b in sorted(edges)],
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, "w") as f:
        json.dump(out, f, indent=2)

    print(f"\nWrote {len(out['systems'])} systems, {len(out['edges'])} edges, "
          f"{len(out['constellations'])} constellations")
    print(f"→ {os.path.abspath(OUT_FILE)}")


if __name__ == "__main__":
    main()
