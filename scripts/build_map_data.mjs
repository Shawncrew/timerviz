/**
 * Fetch Pure Blind + Fade from ESI and generate a constellation-aware 2D layout.
 * Run: node scripts/build_map_data.mjs
 *
 * ESI responses are cached in scripts/esi-cache.json — delete it to re-fetch.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "esi-cache.json");
const OUT_FILE   = join(__dirname, "..", "timerviz", "static", "timerviz", "map-data.json");
const ESI        = "https://esi.evetech.net/latest";

const REGIONS = [
  { id: 10000046, name: "Fade",       color: "#8957e5" },
  { id: 10000023, name: "Pure Blind", color: "#1f6feb" },
];

// ── Layout parameters ─────────────────────────────────────────────────────────
//
// Stage 1 — constellation-level force-directed
//   Each constellation is a node; inter-constellation gates are springs.
//   Anchors come from normalized EVE XZ centroids.
const C_MIN_DIST   = 0.38;   // minimum gap between constellation centers
const C_EDGE_REST  = 0.42;   // spring rest length for connected constellations
const C_EDGE_K     = 0.008;  // spring stiffness
const C_ANCHOR     = 0.08;   // pull toward EVE-coord anchor per iteration
const C_ITERS      = 600;    // iterations with springs + anchor
const C_SEP_ITERS  = 300;    // separation-only cleanup

// Stage 2 — system-level force-directed (global, all pairs)
//   After bubbles are placed, run a global simulation to clear all overlaps.
const S_REPULSE_SAME  = 0.075;  // minimum dist between systems in SAME constellation
const S_REPULSE_DIFF  = 0.110;  // minimum dist between systems in DIFFERENT constellations
const S_EDGE_K        = 0.005;  // gate spring stiffness (keeps connected systems close)
const S_EDGE_REST     = 0.10;   // gate spring rest length
const S_CONST_PULL    = 0.03;   // pull each system back toward its constellation center
const S_ITERS         = 500;    // global system iterations
const BUBBLE_RADIUS   = 0.10;   // initial system placement radius per constellation

// ── Cache ─────────────────────────────────────────────────────────────────────
let cache = existsSync(CACHE_FILE)
  ? JSON.parse(readFileSync(CACHE_FILE, "utf8"))
  : {};

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
  const systems = new Map();
  const constellations = new Map();
  const edges = new Set();

  for (const reg of REGIONS) {
    console.log(`\nFetching region: ${reg.name}`);
    const region = await get(`${ESI}/universe/regions/${reg.id}/`);
    for (const cid of region.constellations) {
      const c = await get(`${ESI}/universe/constellations/${cid}/`);
      constellations.set(cid, {
        id: cid, name: c.name,
        regionId: reg.id, regionName: reg.name, color: reg.color,
        systems: c.systems,
      });
      for (const sid of c.systems) {
        const s = await get(`${ESI}/universe/systems/${sid}/`);
        systems.set(sid, {
          id: sid, name: s.name,
          x: s.position.x, y: s.position.y, z: s.position.z,
          regionId: reg.id, regionName: reg.name, regionColor: reg.color,
          constellationId: cid, constellationName: c.name,
          stargates: s.stargates ?? [],
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
      const a = Math.min(sys.id, dest), b = Math.max(sys.id, dest);
      edges.add(`${a}-${b}`);
    }
  }

  return { systems, constellations, edges };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clamp(v, lo = 0.02, hi = 0.98) { return Math.max(lo, Math.min(hi, v)); }
function dist2(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay) || 1e-9; }

// ── Stage 1: constellation-level layout ───────────────────────────────────────
function layoutConstellations(systems, constellations, edges) {
  const cids = [...constellations.keys()];

  // EVE XZ centroids → normalized [0.08, 0.92]
  const cxEve = {}, czEve = {};
  for (const cid of cids) {
    const sids = constellations.get(cid).systems.filter((s) => systems.has(s));
    if (!sids.length) continue;
    cxEve[cid] = sids.reduce((s, id) => s + systems.get(id).x, 0) / sids.length;
    czEve[cid] = sids.reduce((s, id) => s + systems.get(id).z, 0) / sids.length;
  }
  const allCx = Object.values(cxEve), allCz = Object.values(czEve);
  const minCx = Math.min(...allCx), maxCx = Math.max(...allCx);
  const minCz = Math.min(...allCz), maxCz = Math.max(...allCz);
  const span  = Math.max(maxCx - minCx, maxCz - minCz) || 1;
  const pad   = 0.08;

  const anchors = {}, pos = {};
  for (const cid of cids) {
    if (cxEve[cid] === undefined) continue;
    const nx = pad + ((cxEve[cid] - minCx) / span) * (1 - 2 * pad);
    const ny = pad + (1 - (czEve[cid] - minCz) / span) * (1 - 2 * pad);
    anchors[cid] = [nx, ny];
    pos[cid]     = [nx, ny];
  }

  // Inter-constellation edges
  const constEdges = new Set();
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    const ca = systems.get(a)?.constellationId;
    const cb = systems.get(b)?.constellationId;
    if (ca && cb && ca !== cb) constEdges.add(`${Math.min(ca,cb)}-${Math.max(ca,cb)}`);
  }

  const valid = cids.filter((c) => pos[c]);

  for (let iter = 0; iter < C_ITERS + C_SEP_ITERS; iter++) {
    const useSprings = iter < C_ITERS;

    // Pairwise separation
    for (let i = 0; i < valid.length; i++) {
      for (let j = i + 1; j < valid.length; j++) {
        const ca = valid[i], cb = valid[j];
        const dx = pos[cb][0] - pos[ca][0], dy = pos[cb][1] - pos[ca][1];
        const d = dist2(0, 0, dx, dy);
        if (d < C_MIN_DIST) {
          const push = (C_MIN_DIST - d) * 0.6;
          const ux = dx / d, uy = dy / d;
          pos[ca][0] -= ux * push; pos[ca][1] -= uy * push;
          pos[cb][0] += ux * push; pos[cb][1] += uy * push;
        }
      }
    }

    if (useSprings) {
      for (const e of constEdges) {
        const [ca, cb] = e.split("-").map(Number);
        if (!pos[ca] || !pos[cb]) continue;
        const dx = pos[cb][0] - pos[ca][0], dy = pos[cb][1] - pos[ca][1];
        const d = dist2(0, 0, dx, dy);
        const f = C_EDGE_K * (d - C_EDGE_REST);
        pos[ca][0] += (dx/d)*f; pos[ca][1] += (dy/d)*f;
        pos[cb][0] -= (dx/d)*f; pos[cb][1] -= (dy/d)*f;
      }
      for (const cid of valid) {
        pos[cid][0] += (anchors[cid][0] - pos[cid][0]) * C_ANCHOR;
        pos[cid][1] += (anchors[cid][1] - pos[cid][1]) * C_ANCHOR;
      }
    }

    for (const cid of valid) {
      pos[cid][0] = clamp(pos[cid][0], 0.04, 0.96);
      pos[cid][1] = clamp(pos[cid][1], 0.04, 0.96);
    }
  }

  return pos;
}

// ── Stage 2: system-level global force-directed ───────────────────────────────
function layoutSystems(systems, constellations, edges, constPos) {
  // Place systems in bubble around constellation center using EVE XZ offsets
  for (const [cid, c] of constellations) {
    const cp = constPos[cid];
    if (!cp) continue;
    const sids = c.systems.filter((s) => systems.has(s));
    if (sids.length === 1) {
      const s = systems.get(sids[0]);
      s.nx = cp[0]; s.ny = cp[1]; continue;
    }
    const cXs = sids.map((s) => systems.get(s).x);
    const cZs = sids.map((s) => systems.get(s).z);
    const cMinX = Math.min(...cXs), cMaxX = Math.max(...cXs);
    const cMinZ = Math.min(...cZs), cMaxZ = Math.max(...cZs);
    const cSpan = Math.max(cMaxX - cMinX, cMaxZ - cMinZ) || 1;
    for (const sid of sids) {
      const s = systems.get(sid);
      s.nx = cp[0] + ((s.x - cMinX) / cSpan - 0.5) * 2 * BUBBLE_RADIUS;
      s.ny = cp[1] - ((s.z - cMinZ) / cSpan - 0.5) * 2 * BUBBLE_RADIUS;
    }
  }

  const sysList = [...systems.values()];
  const n = sysList.length;
  const idToIdx = new Map(sysList.map((s, i) => [s.id, i]));

  // Build edge index
  const edgeList = [...edges].map((e) => {
    const [a, b] = e.split("-").map(Number);
    return [idToIdx.get(a), idToIdx.get(b)];
  }).filter(([a, b]) => a !== undefined && b !== undefined);

  // Constellation center lookup
  const cCenter = {};
  for (const [cid, cp] of Object.entries(constPos)) {
    cCenter[parseInt(cid)] = cp;
  }

  for (let iter = 0; iter < S_ITERS; iter++) {
    // Cool down repulsion slightly over time (simulated annealing)
    const cool = 1 - iter / S_ITERS * 0.3;

    // All-pairs repulsion
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const si = sysList[i], sj = sysList[j];
        const dx = sj.nx - si.nx, dy = sj.ny - si.ny;
        const d = dist2(0, 0, dx, dy);
        const minD = si.constellationId === sj.constellationId
          ? S_REPULSE_SAME
          : S_REPULSE_DIFF;
        if (d < minD) {
          const push = (minD - d) * 0.55 * cool;
          const ux = dx / d, uy = dy / d;
          si.nx -= ux * push * 0.5; si.ny -= uy * push * 0.5;
          sj.nx += ux * push * 0.5; sj.ny += uy * push * 0.5;
        }
      }
    }

    // Gate edge springs (attract connected systems)
    for (const [ia, ib] of edgeList) {
      if (ia === undefined || ib === undefined) continue;
      const si = sysList[ia], sj = sysList[ib];
      const dx = sj.nx - si.nx, dy = sj.ny - si.ny;
      const d = dist2(0, 0, dx, dy);
      const f = S_EDGE_K * (d - S_EDGE_REST);
      si.nx += (dx/d)*f; si.ny += (dy/d)*f;
      sj.nx -= (dx/d)*f; sj.ny -= (dy/d)*f;
    }

    // Constellation centroid pull (keeps clusters from drifting apart)
    for (const s of sysList) {
      const cp = cCenter[s.constellationId];
      if (!cp) continue;
      s.nx += (cp[0] - s.nx) * S_CONST_PULL;
      s.ny += (cp[1] - s.ny) * S_CONST_PULL;
    }

    for (const s of sysList) {
      s.nx = clamp(s.nx, 0.03, 0.97);
      s.ny = clamp(s.ny, 0.03, 0.97);
    }
  }

  // Final normalize to [0.04, 0.96]
  const allNx = sysList.map((s) => s.nx), allNy = sysList.map((s) => s.ny);
  const minNx = Math.min(...allNx), maxNx = Math.max(...allNx);
  const minNy = Math.min(...allNy), maxNy = Math.max(...allNy);
  const totalSpan = Math.max(maxNx - minNx, maxNy - minNy) || 1;
  const cxAll = (minNx + maxNx) / 2, cyAll = (minNy + maxNy) / 2;
  const scale = (1 - 2 * 0.04) / totalSpan;
  for (const s of sysList) {
    s.nx = clamp(0.5 + (s.nx - cxAll) * scale, 0.04, 0.96);
    s.ny = clamp(0.5 + (s.ny - cyAll) * scale, 0.04, 0.96);
  }

  // Rescale constellation centers to match
  for (const cid of Object.keys(constPos)) {
    const cp = constPos[cid];
    constPos[cid] = [
      clamp(0.5 + (cp[0] - cxAll) * scale, 0.04, 0.96),
      clamp(0.5 + (cp[1] - cyAll) * scale, 0.04, 0.96),
    ];
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nLayout: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);

  console.log("Stage 1: constellation layout…");
  const constPos = layoutConstellations(systems, constellations, edges);

  console.log("Stage 2: system layout…");
  layoutSystems(systems, constellations, edges, constPos);

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
    constellations: Object.fromEntries(
      [...constellations.entries()].map(([cid, c]) => [
        String(cid),
        {
          id: cid, name: c.name,
          regionId: c.regionId, regionName: c.regionName, color: c.color,
          centerNx: parseFloat((constPos[cid]?.[0] ?? 0.5).toFixed(6)),
          centerNy: parseFloat((constPos[cid]?.[1] ?? 0.5).toFixed(6)),
        },
      ])
    ),
    systems: [...systems.values()]
      .sort((a, b) => a.id - b.id)
      .map(({ id, name, regionId, regionName, regionColor, constellationId, constellationName, nx, ny }) => ({
        id, name, regionId, regionName, regionColor,
        constellationId, constellationName,
        nx: parseFloat(nx.toFixed(6)), ny: parseFloat(ny.toFixed(6)),
      })),
    edges: [...edges].map((e) => {
      const [a, b] = e.split("-").map(Number);
      return { a, b };
    }),
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.systems.length} systems, ${out.edges.length} edges, ${Object.keys(out.constellations).length} constellations`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
