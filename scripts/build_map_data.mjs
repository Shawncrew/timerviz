/**
 * Build map-data.json:
 *  - All 85 systems in Dotlan Pure Blind SVG (incl. 5 Fade border systems): exact Dotlan coords
 *  - Remaining 22 Fade systems: force-directed from their placed neighbours
 *  - Global separation pass to clear overlaps
 *
 * Run: node scripts/build_map_data.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "esi-cache.json");
const OUT_FILE   = join(__dirname, "..", "timerviz", "static", "timerviz", "map-data.json");
const ESI        = "https://esi.evetech.net/latest";

const REGIONS = [
  { id: 10000046, name: "Fade",       color: "#8957e5" },
  { id: 10000023, name: "Pure Blind", color: "#1f6feb" },
];

// ── Dotlan Pure Blind SVG coordinates (1024 × 768) ───────────────────────────
// Includes 85 Pure Blind systems AND 5 Fade border systems visible on the map.
const DOTLAN = {
  width: 1024, height: 768,
  systems: {
    // ── Pure Blind ────────────────────────────────────────────────────────────
    "E-Z2ZX":  { x:   0, y: 300 }, "7D-0SQ":  { x:   0, y: 625 },
    "RORZ-H":  { x:  30, y: 340 }, "KU5R-W":  { x:  30, y: 505 },
    "H1-J33":  { x:  30, y: 545 }, "Y-C3EQ":  { x:  30, y: 585 },
    "P-2TTL":  { x:  65, y: 300 }, "OGV-AS":  { x:  65, y: 625 },
    "UI-8ZE":  { x:  65, y: 675 }, "O-A6YN":  { x: 100, y: 339 },
    "7X-VKB":  { x: 105, y: 255 }, "B-9C24":  { x: 140, y: 300 },
    "Y2-6EA":  { x: 145, y: 665 }, "DT-TCD":  { x: 145, y: 715 },
    "TFA0-U":  { x: 170, y: 620 }, "F-NMX6":  { x: 205, y: 300 },
    "ZKYV-W":  { x: 205, y: 350 }, "FWA-4V":  { x: 205, y: 400 },
    "RZC-16":  { x: 215, y: 460 }, "D2-HOS":  { x: 215, y: 665 },
    "HPS5-C":  { x: 215, y: 715 }, "MQ-NPY":  { x: 245, y: 620 },
    "GA-P6C":  { x: 250, y: 250 }, "7RM-N0":  { x: 275, y: 300 },
    "S-MDYI":  { x: 275, y: 350 }, "RQH-MY":  { x: 285, y: 665 },
    "MT9Q-S":  { x: 320, y: 595 }, "ROIR-Y":  { x: 345, y: 215 },
    "G95-VZ":  { x: 345, y: 255 }, "KLY-C0":  { x: 345, y: 300 },
    "CL6-ZG":  { x: 345, y: 350 }, "RD-G2R":  { x: 350, y: 435 },
    "UC3H-Y":  { x: 370, y: 500 }, "KDV-DE":  { x: 385, y: 560 },
    "J-CIJV":  { x: 415, y: 255 }, "X-7OMU":  { x: 415, y: 300 },
    "CXN1-Z":  { x: 415, y: 350 }, "X47L-Q":  { x: 435, y: 140 },
    "6GWE-A":  { x: 440, y: 590 }, "4-ABS8":  { x: 460, y: 200 },
    "J-OK0C":  { x: 460, y: 635 }, "KQK1-2":  { x: 480, y:  85 },
    "R-LW2I":  { x: 490, y: 255 }, "B8EN-S":  { x: 490, y: 300 },
    "DP-1YE":  { x: 510, y: 175 }, "MI6O-6":  { x: 510, y: 445 },
    "UR-E6D":  { x: 530, y: 115 }, "3V8-LJ":  { x: 555, y: 300 },
    "R6XN-9":  { x: 565, y: 365 }, "L-TS8S":  { x: 565, y: 430 },
    "O-BY0Y":  { x: 575, y:  80 }, "O-N8XZ":  { x: 575, y: 485 },
    "2-6TGQ":  { x: 585, y: 175 }, "JE-D5U":  { x: 600, y: 260 },
    "EWOK-K":  { x: 615, y: 560 }, "EC-P8R":  { x: 615, y: 610 },
    "5ZXX-K":  { x: 620, y: 210 }, "2D-0SO":  { x: 640, y: 105 },
    "PFU-LH":  { x: 640, y: 315 }, "8S-0E1":  { x: 665, y: 170 },
    "OE-9UF":  { x: 680, y: 260 }, "G-M4I8":  { x: 695, y: 580 },
    "U-INPD":  { x: 710, y:  10 }, "D7T-C0":  { x: 720, y: 145 },
    "93PI-4":  { x: 720, y: 620 }, "XI-VUF":  { x: 775, y: 105 },
    "R-2R0G":  { x: 780, y: 545 }, "KI-TL0":  { x: 785, y: 150 },
    "DK-FXK":  { x: 815, y:  20 }, "JC-YX8":  { x: 815, y: 215 },
    "M-YCD4":  { x: 825, y: 450 }, "A8I-C5":  { x: 840, y:  65 },
    "EL8-4Q":  { x: 845, y: 180 }, "Q-5211":  { x: 860, y: 485 },
    "N-H32Y":  { x: 870, y: 145 }, "5-9WNU":  { x: 890, y: 225 },
    "ZJET-E":  { x: 900, y:   0 }, "XQ-PXU":  { x: 900, y: 445 },
    "C-H9X7":  { x: 915, y:  95 }, "WW-KGD":  { x: 920, y: 395 },
    "CR-AQH":  { x: 920, y: 510 }, "M-76XI":  { x: 925, y:  35 },
    "12YA-2":  { x: 925, y: 275 }, "BDV3-T":  { x: 950, y: 340 },
    "ION-FG":  { x: 955, y: 170 },
    // ── Fade border systems visible on Pure Blind map ─────────────────────────
    "VRH-H7":  { x:  55, y: 160 }, "O-CNPR":  { x: 115, y:  90 },
    "DW-T2I":  { x: 210, y:  40 }, "E-9ORY":  { x: 345, y:  90 },
    "C8-CHY":  { x: 345, y: 135 },
  },
};

// Full canvas is 0→1. All Dotlan coords map into [LEFT, RIGHT] × [TOP, BOT].
const LEFT = 0.01, RIGHT = 0.99, TOP = 0.01, BOT = 0.99;

// Minimum node separation (normalised). NODE_RX=52 on 4000-unit canvas → 0.013 per unit
const MIN_SEP    = 0.015;
const SEP_ITERS  = 400;

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, "utf8")) : {};
async function get(url) {
  if (cache[url]) return cache[url];
  process.stdout.write(`  ESI ${url.replace(ESI, "")}\n`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  const data = await r.json();
  cache[url] = data;
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  await new Promise((res) => setTimeout(res, 55));
  return data;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────
async function fetchAll() {
  const systems = new Map(), constellations = new Map(), edges = new Set();
  for (const reg of REGIONS) {
    console.log(`\nFetching region: ${reg.name}`);
    const region = await get(`${ESI}/universe/regions/${reg.id}/`);
    for (const cid of region.constellations) {
      const c = await get(`${ESI}/universe/constellations/${cid}/`);
      constellations.set(cid, { id: cid, name: c.name, regionId: reg.id, regionName: reg.name, color: reg.color, systems: c.systems });
      for (const sid of c.systems) {
        const s = await get(`${ESI}/universe/systems/${sid}/`);
        systems.set(sid, {
          id: sid, name: s.name, x: s.position.x, y: s.position.y, z: s.position.z,
          regionId: reg.id, regionName: reg.name, regionColor: reg.color,
          constellationId: cid, constellationName: c.name, stargates: s.stargates ?? [],
        });
      }
    }
  }
  console.log(`\nFetching stargates for ${systems.size} systems…`);
  for (const sys of systems.values()) {
    for (const gid of sys.stargates) {
      const g = await get(`${ESI}/universe/stargates/${gid}/`);
      const dest = g.destination.system_id;
      if (!systems.has(dest)) continue;
      edges.add(`${Math.min(sys.id, dest)}-${Math.max(sys.id, dest)}`);
    }
  }
  return { systems, constellations, edges };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Layout ────────────────────────────────────────────────────────────────────
function buildLayout(systems, constellations, edges) {
  const dotW = DOTLAN.width, dotH = DOTLAN.height;
  const canW = RIGHT - LEFT, canH = BOT - TOP;

  // Step 1: stamp Dotlan coords for all systems that appear in the map
  const placed = new Set();
  for (const sys of systems.values()) {
    const dot = DOTLAN.systems[sys.name];
    if (dot) {
      sys.nx = LEFT + (dot.x / dotW) * canW;
      sys.ny = TOP  + (dot.y / dotH) * canH;
      placed.add(sys.id);
    }
  }
  console.log(`  Placed ${placed.size} systems from Dotlan coordinates.`);

  // Step 2: greedy crossing-minimizing placement for unplaced Fade systems
  const unplaced = [...systems.values()].filter((s) => !placed.has(s.id));
  console.log(`  Placing ${unplaced.length} unplaced Fade systems (crossing-minimizing)…`);

  // Build adjacency
  const adj = new Map();
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }

  // Segment intersection test (excludes shared endpoints)
  function segsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1x = bx-ax, d1y = by-ay, d2x = dx-cx, d2y = dy-cy;
    const denom = d1x*d2y - d1y*d2x;
    if (Math.abs(denom) < 1e-12) return false;
    const t = ((cx-ax)*d2y - (cy-ay)*d2x) / denom;
    const u = ((cx-ax)*d1y - (cy-ay)*d1x) / denom;
    return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
  }

  // Live list of placed edges (updated as we place each system)
  const placedEdges = [];
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    if (placed.has(a) && placed.has(b)) {
      const sA = systems.get(a), sB = systems.get(b);
      placedEdges.push([sA.nx, sA.ny, sB.nx, sB.ny]);
    }
  }

  // Candidate ring: 6 distances × 24 angles = 144 candidates per system
  const DISTS  = [0.035, 0.055, 0.075, 0.10, 0.13, 0.17];
  const ANGLES = Array.from({ length: 24 }, (_, i) => (i / 24) * 2 * Math.PI);

  // Sort by most placed neighbours first; re-sort each pass so newly placed nodes help later systems
  for (let pass = 0; pass < 4; pass++) {
    let placedThisPass = 0;
    const remaining = unplaced.filter((s) => !placed.has(s.id));
    remaining.sort((a, b) => {
      const an = (adj.get(a.id)||[]).filter(id => placed.has(id)).length;
      const bn = (adj.get(b.id)||[]).filter(id => placed.has(id)).length;
      return bn - an;
    });

    for (const sys of remaining) {
      const nbrs = (adj.get(sys.id)||[])
        .filter(id => placed.has(id))
        .map(id => systems.get(id));

      if (nbrs.length === 0 && pass < 3) continue; // wait for neighbours to be placed

      // Anchor = average of placed neighbours (or rough fallback)
      const anchor = nbrs.length
        ? { nx: nbrs.reduce((s,n)=>s+n.nx,0)/nbrs.length,
            ny: nbrs.reduce((s,n)=>s+n.ny,0)/nbrs.length }
        : { nx: LEFT + canW * 0.05, ny: TOP + canH * 0.5 };

      // Generate & score candidates
      let best = null, bestScore = Infinity;
      for (const dist of DISTS) {
        for (const angle of ANGLES) {
          const cnx = clamp(anchor.nx + Math.cos(angle)*dist, LEFT+0.01, RIGHT-0.01);
          const cny = clamp(anchor.ny + Math.sin(angle)*dist, TOP+0.01,  BOT-0.01);

          // Skip if too close to any placed node
          let tooClose = false;
          for (const [, s] of systems) {
            if (!placed.has(s.id)) continue;
            if (Math.hypot(cnx-s.nx, cny-s.ny) < MIN_SEP) { tooClose = true; break; }
          }
          if (tooClose) continue;

          // Count edge crossings introduced by placing sys here
          let crossings = 0;
          for (const nbr of nbrs) {
            for (const [ex1,ey1,ex2,ey2] of placedEdges) {
              if (segsIntersect(cnx,cny,nbr.nx,nbr.ny, ex1,ey1,ex2,ey2)) crossings++;
            }
          }

          // Prefer extending left (Fade is west of Pure Blind)
          const leftBias = (anchor.nx - cnx) * 3;
          const score = crossings * 1000 - leftBias + dist * 5;
          if (score < bestScore) { bestScore = score; best = { nx: cnx, ny: cny }; }
        }
      }

      if (!best) {
        // Fallback: just place at anchor shifted left, ignore spacing
        best = { nx: clamp(anchor.nx - 0.05, LEFT, RIGHT), ny: anchor.ny };
      }

      sys.nx = best.nx; sys.ny = best.ny;
      placed.add(sys.id);
      placedThisPass++;

      // Register new edges for future crossing checks
      for (const nbr of nbrs) placedEdges.push([sys.nx, sys.ny, nbr.nx, nbr.ny]);
    }
    console.log(`    Pass ${pass+1}: placed ${placedThisPass}`);
    if ([...unplaced].every(s => placed.has(s.id))) break;
  }

  const allList = [...systems.values()];

  // Step 3: global separation — push ALL node pairs apart if overlapping
  console.log(`  Running ${SEP_ITERS} separation iterations…`);
  for (let iter = 0; iter < SEP_ITERS; iter++) {
    for (let i = 0; i < allList.length; i++) {
      for (let j = i + 1; j < allList.length; j++) {
        const si = allList[i], sj = allList[j];
        const dx = sj.nx - si.nx, dy = sj.ny - si.ny;
        const d = Math.hypot(dx, dy) || 1e-9;
        if (d < MIN_SEP) {
          const push = (MIN_SEP - d) * 0.5;
          const ux = dx / d, uy = dy / d;
          // Unplaced nodes move freely; placed nodes move less
          const wi = placed.has(si.id) ? 0.15 : 0.5;
          const wj = placed.has(sj.id) ? 0.15 : 0.5;
          si.nx -= ux * push * wi; si.ny -= uy * push * wi;
          sj.nx += ux * push * wj; sj.ny += uy * push * wj;
          si.nx = clamp(si.nx, LEFT, RIGHT); si.ny = clamp(si.ny, TOP, BOT);
          sj.nx = clamp(sj.nx, LEFT, RIGHT); sj.ny = clamp(sj.ny, TOP, BOT);
        }
      }
    }
  }

  // Step 4: scale layout to a compact cluster centered at (0.5, 0.5)
  // TARGET_SPAN controls how much of the canvas the cluster occupies (0.0–1.0).
  // The rest is empty drag space on all sides.
  const TARGET_SPAN = 0.60;

  const allNx = allList.map((s) => s.nx), allNy = allList.map((s) => s.ny);
  const minNx = Math.min(...allNx), maxNx = Math.max(...allNx);
  const minNy = Math.min(...allNy), maxNy = Math.max(...allNy);
  const spanX = maxNx - minNx || 1, spanY = maxNy - minNy || 1;
  const span  = Math.max(spanX, spanY);   // uniform scale preserves aspect ratio
  const scale = TARGET_SPAN / span;
  const cxSrc = (minNx + maxNx) / 2, cySrc = (minNy + maxNy) / 2;

  for (const s of allList) {
    s.nx = 0.5 + (s.nx - cxSrc) * scale;
    s.ny = 0.5 + (s.ny - cySrc) * scale;
  }
  console.log(`  Scaled to ${(TARGET_SPAN*100).toFixed(0)}% of canvas, centered at (0.5, 0.5)`);

  // Step 5: recompute constellation centres
  for (const [, c] of constellations) {
    const sids = c.systems.filter((id) => systems.has(id));
    if (!sids.length) continue;
    c.centerNx = sids.reduce((s, id) => s + systems.get(id).nx, 0) / sids.length;
    c.centerNy = sids.reduce((s, id) => s + systems.get(id).ny, 0) / sids.length;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nLayout: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);
  buildLayout(systems, constellations, edges);

  const out = {
    generated: new Date().toISOString(), regions: REGIONS,
    constellations: Object.fromEntries([...constellations.entries()].map(([cid, c]) => [String(cid), {
      id: cid, name: c.name, regionId: c.regionId, regionName: c.regionName, color: c.color,
      centerNx: parseFloat((c.centerNx ?? 0.5).toFixed(6)),
      centerNy: parseFloat((c.centerNy ?? 0.5).toFixed(6)),
    }])),
    systems: [...systems.values()].sort((a, b) => a.id - b.id).map(
      ({ id, name, regionId, regionName, regionColor, constellationId, constellationName, nx, ny }) => ({
        id, name, regionId, regionName, regionColor, constellationId, constellationName,
        nx: parseFloat(nx.toFixed(6)), ny: parseFloat(ny.toFixed(6)),
      })
    ),
    edges: [...edges].map((e) => { const [a, b] = e.split("-").map(Number); return { a, b }; }),
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.systems.length} systems, ${out.edges.length} edges`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
