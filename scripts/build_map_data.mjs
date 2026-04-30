/**
 * Fetch Pure Blind + Fade from ESI and generate a constellation-aware 2D layout.
 * Run: node scripts/build_map_data.mjs
 *
 * ESI responses are cached in scripts/esi-cache.json — re-run without re-fetching
 * by not deleting that file.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "esi-cache.json");
const OUT_FILE   = join(__dirname, "..", "timerviz", "static", "timerviz", "map-data.json");
const ESI        = "https://esi.evetech.net/latest";

// ── Region config ─────────────────────��─────────────────────────────��─────────
const REGIONS = [
  { id: 10000046, name: "Fade",       color: "#8957e5" },
  { id: 10000023, name: "Pure Blind", color: "#1f6feb" },
];

// ── Layout tuning ────────────────────────────────────────────────���────────────
const BUBBLE_RADIUS  = 0.075;   // half-width of each constellation cluster
const MIN_CONST_DIST = 0.20;    // minimum separation between constellation centers
const EDGE_REST      = 0.24;    // spring rest length between adjacent constellations
const EDGE_K         = 0.012;   // spring stiffness
const ANCHOR_PULL    = 0.18;    // pull back toward EVE-coordinate anchor each iter
const ITERS          = 350;     // force-directed iterations (with springs + anchor)
const SEP_ITERS      = 150;     // separation-only cleanup iterations
const MIN_SYS_DIST   = 0.046;   // minimum separation between individual system nodes

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
  const systems = new Map();       // id -> obj
  const constellations = new Map(); // id -> obj
  const edges = new Set();          // "min-max"

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

// ── Layout ────────────────────────────────────────────────────────────────────
function clamp(v, lo = 0.01, hi = 0.99) { return Math.max(lo, Math.min(hi, v)); }

function buildLayout(systems, constellations, edges) {
  const cids = [...constellations.keys()];

  // Step 1: Constellation centroids from EVE XZ space
  const cxEve = {}, czEve = {};
  for (const cid of cids) {
    const sids = constellations.get(cid).systems.filter((s) => systems.has(s));
    if (!sids.length) continue;
    cxEve[cid] = sids.reduce((s, id) => s + systems.get(id).x, 0) / sids.length;
    czEve[cid] = sids.reduce((s, id) => s + systems.get(id).z, 0) / sids.length;
  }

  // Step 2: Normalize constellation centroids to [0.08, 0.92]
  const allCx = Object.values(cxEve), allCz = Object.values(czEve);
  const minCx = Math.min(...allCx), maxCx = Math.max(...allCx);
  const minCz = Math.min(...allCz), maxCz = Math.max(...allCz);
  const span  = Math.max(maxCx - minCx, maxCz - minCz) || 1;
  const pad   = 0.10;

  const anchors = {}, pos = {};
  for (const cid of cids) {
    if (cxEve[cid] === undefined) continue;
    const nx = pad + ((cxEve[cid] - minCx) / span) * (1 - 2 * pad);
    const ny = pad + (1 - (czEve[cid] - minCz) / span) * (1 - 2 * pad);
    anchors[cid] = [nx, ny];
    pos[cid]     = [nx, ny];
  }

  // Step 3: Inter-constellation edge graph
  const constEdges = new Set();
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    const ca = systems.get(a)?.constellationId;
    const cb = systems.get(b)?.constellationId;
    if (ca && cb && ca !== cb) {
      constEdges.add(`${Math.min(ca, cb)}-${Math.max(ca, cb)}`);
    }
  }

  // Step 4: Force-directed at constellation level
  const validCids = cids.filter((c) => pos[c]);
  for (let iter = 0; iter < ITERS + SEP_ITERS; iter++) {
    const useSprings = iter < ITERS;

    // Pairwise separation
    for (let i = 0; i < validCids.length; i++) {
      for (let j = i + 1; j < validCids.length; j++) {
        const ca = validCids[i], cb = validCids[j];
        const dx = pos[cb][0] - pos[ca][0];
        const dy = pos[cb][1] - pos[ca][1];
        const dist = Math.hypot(dx, dy) || 1e-9;
        if (dist < MIN_CONST_DIST) {
          const push = (MIN_CONST_DIST - dist) * 0.55;
          const ux = dx / dist, uy = dy / dist;
          pos[ca][0] -= ux * push; pos[ca][1] -= uy * push;
          pos[cb][0] += ux * push; pos[cb][1] += uy * push;
        }
      }
    }

    if (useSprings) {
      // Edge springs
      for (const e of constEdges) {
        const [ca, cb] = e.split("-").map(Number);
        if (!pos[ca] || !pos[cb]) continue;
        const dx = pos[cb][0] - pos[ca][0];
        const dy = pos[cb][1] - pos[ca][1];
        const dist = Math.hypot(dx, dy) || 1e-9;
        const f = EDGE_K * (dist - EDGE_REST);
        const fx = (dx / dist) * f, fy = (dy / dist) * f;
        pos[ca][0] += fx; pos[ca][1] += fy;
        pos[cb][0] -= fx; pos[cb][1] -= fy;
      }
      // Anchor pull
      for (const cid of validCids) {
        pos[cid][0] += (anchors[cid][0] - pos[cid][0]) * ANCHOR_PULL;
        pos[cid][1] += (anchors[cid][1] - pos[cid][1]) * ANCHOR_PULL;
      }
    }

    for (const cid of validCids) {
      pos[cid][0] = clamp(pos[cid][0], 0.04, 0.96);
      pos[cid][1] = clamp(pos[cid][1], 0.04, 0.96);
    }
  }

  // Step 5: Place systems within their constellation bubble
  for (const sys of systems.values()) {
    const cid = sys.constellationId;
    if (!pos[cid]) { sys.nx = 0.5; sys.ny = 0.5; continue; }

    const sids = constellations.get(cid).systems.filter((s) => systems.has(s));
    if (sids.length === 1) { sys.nx = pos[cid][0]; sys.ny = pos[cid][1]; continue; }

    const cXs = sids.map((s) => systems.get(s).x);
    const cZs = sids.map((s) => systems.get(s).z);
    const cMinX = Math.min(...cXs), cMaxX = Math.max(...cXs);
    const cMinZ = Math.min(...cZs), cMaxZ = Math.max(...cZs);
    const cSpan = Math.max(cMaxX - cMinX, cMaxZ - cMinZ) || 1;

    const lx =  ((sys.x - cMinX) / cSpan - 0.5) * 2 * BUBBLE_RADIUS;
    const ly = -((sys.z - cMinZ) / cSpan - 0.5) * 2 * BUBBLE_RADIUS;
    sys.nx = pos[cid][0] + lx;
    sys.ny = pos[cid][1] + ly;
  }

  // Step 6: System-level separation (avoids node overlaps within dense constellations)
  const sysList = [...systems.values()];
  for (let iter = 0; iter < 100; iter++) {
    for (let i = 0; i < sysList.length; i++) {
      for (let j = i + 1; j < sysList.length; j++) {
        const dx = sysList[j].nx - sysList[i].nx;
        const dy = sysList[j].ny - sysList[i].ny;
        const dist = Math.hypot(dx, dy) || 1e-9;
        if (dist < MIN_SYS_DIST) {
          const push = (MIN_SYS_DIST - dist) * 0.45;
          const ux = dx / dist, uy = dy / dist;
          sysList[i].nx -= ux * push * 0.5; sysList[i].ny -= uy * push * 0.5;
          sysList[j].nx += ux * push * 0.5; sysList[j].ny += uy * push * 0.5;
        }
      }
    }
  }

  // Step 7: Final normalize to [0.04, 0.96]
  const allNx = sysList.map((s) => s.nx), allNy = sysList.map((s) => s.ny);
  const minNx = Math.min(...allNx), maxNx = Math.max(...allNx);
  const minNy = Math.min(...allNy), maxNy = Math.max(...allNy);
  const totalSpan = Math.max(maxNx - minNx, maxNy - minNy) || 1;
  const cxAll = (minNx + maxNx) / 2, cyAll = (minNy + maxNy) / 2;
  const scale = (1 - 2 * 0.05) / totalSpan;

  for (const s of sysList) {
    s.nx = clamp(0.5 + (s.nx - cxAll) * scale, 0.04, 0.96);
    s.ny = clamp(0.5 + (s.ny - cyAll) * scale, 0.04, 0.96);
  }

  // Also rescale constellation centers
  for (const cid of validCids) {
    pos[cid][0] = clamp(0.5 + (pos[cid][0] - cxAll) * scale, 0.04, 0.96);
    pos[cid][1] = clamp(0.5 + (pos[cid][1] - cyAll) * scale, 0.04, 0.96);
  }

  return pos;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nLayout: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);

  const constCenters = buildLayout(systems, constellations, edges);

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
    constellations: Object.fromEntries(
      [...constellations.entries()].map(([cid, c]) => [
        String(cid),
        {
          id: cid, name: c.name,
          regionId: c.regionId, regionName: c.regionName, color: c.color,
          centerNx: parseFloat((constCenters[cid]?.[0] ?? 0.5).toFixed(6)),
          centerNy: parseFloat((constCenters[cid]?.[1] ?? 0.5).toFixed(6)),
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
