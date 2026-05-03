/**
 * Fetch Pure Blind + Fade from ESI and generate a proper per-region XZ projection.
 * Each region is normalised independently then placed side-by-side on the canvas.
 * This matches what Dotlan does — each region maps its own XZ extent to screen space.
 *
 * Run: node scripts/build_map_data.mjs
 * ESI responses cached in scripts/esi-cache.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = join(__dirname, "esi-cache.json");
const OUT_FILE   = join(__dirname, "..", "timerviz", "static", "timerviz", "map-data.json");
const ESI        = "https://esi.evetech.net/latest";

// Region order left → right on canvas
const REGIONS = [
  { id: 10000046, name: "Fade",       color: "#8957e5" },
  { id: 10000023, name: "Pure Blind", color: "#1f6feb" },
];

// How much of the canvas each region occupies (fractions, must sum ≤ 1)
// Gap between regions
const REGION_GAP  = 0.04;
const CANVAS_PAD  = 0.02;   // outer padding on all sides

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

// ── Layout: per-region XZ projection ─────────────────────────────────────────
//
// EVE coordinate conventions for region maps:
//   Screen X  =  EVE X   (higher X → right)
//   Screen Y  = -EVE Z   (higher Z → up in EVE → lower on screen, so we flip)
//
// Each region's XZ extent is independently normalised so the intra-region
// topology matches Dotlan.  Regions are placed left→right with a gap.
//
function buildLayout(systems, constellations) {
  // Group systems by region in the declared order
  const byRegion = new Map(REGIONS.map((r) => [r.id, []]));
  for (const s of systems.values()) byRegion.get(s.regionId)?.push(s);

  // Determine horizontal slices for each region
  // Weight slices by system count so each region gets proportional width
  const totalSystems = [...byRegion.values()].reduce((n, a) => n + a.length, 0);
  const usableWidth = 1 - 2 * CANVAS_PAD - REGION_GAP * (REGIONS.length - 1);

  let cursorX = CANVAS_PAD;
  const regionSlices = new Map();   // regionId → { left, right }

  for (const reg of REGIONS) {
    const sysCount = byRegion.get(reg.id)?.length ?? 0;
    const width    = usableWidth * (sysCount / totalSystems);
    regionSlices.set(reg.id, { left: cursorX, right: cursorX + width });
    cursorX += width + REGION_GAP;
  }

  // Project each region independently in XZ space
  for (const reg of REGIONS) {
    const slice   = regionSlices.get(reg.id);
    const sysList = byRegion.get(reg.id) ?? [];
    if (!sysList.length) continue;

    const xs = sysList.map((s) => s.x);
    const zs = sysList.map((s) => s.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const spanX = maxX - minX || 1;
    const spanZ = maxZ - minZ || 1;

    // Maintain aspect ratio — fit inside slice without distortion
    const sliceW = slice.right - slice.left;
    const sliceH = 1 - 2 * CANVAS_PAD;
    const aspect = spanX / spanZ;

    let scaleX, scaleZ, offX = 0, offY = 0;
    if (aspect > sliceW / sliceH) {
      // width-limited
      scaleX = sliceW / spanX;
      scaleZ = scaleX;
      offY   = (sliceH - spanZ * scaleZ) / 2;
    } else {
      // height-limited
      scaleZ = sliceH / spanZ;
      scaleX = scaleZ;
      offX   = (sliceW - spanX * scaleX) / 2;
    }

    for (const s of sysList) {
      s.nx = slice.left + offX + ((s.x - minX) * scaleX);
      // Flip Z: higher EVE Z = "north" = top of screen
      s.ny = CANVAS_PAD + offY + ((maxZ - s.z) * scaleZ);

      s.nx = Math.max(0.01, Math.min(0.99, s.nx));
      s.ny = Math.max(0.01, Math.min(0.99, s.ny));
    }
  }

  // Recompute constellation centres from final positions
  for (const [cid, c] of constellations) {
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

  console.log("Building per-region XZ projection…");
  buildLayout(systems, constellations);

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
    constellations: Object.fromEntries(
      [...constellations.entries()].map(([cid, c]) => [
        String(cid),
        {
          id: cid, name: c.name,
          regionId: c.regionId, regionName: c.regionName, color: c.color,
          centerNx: parseFloat((c.centerNx ?? 0.5).toFixed(6)),
          centerNy: parseFloat((c.centerNy ?? 0.5).toFixed(6)),
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
