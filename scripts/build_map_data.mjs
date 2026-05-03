/**
 * Build map-data.json using:
 *  - Pure Blind: exact Dotlan pixel coordinates (from dotlan.net/svg/Pure_Blind.svg)
 *  - Fade:       per-region EVE XZ projection
 *
 * After placing all systems a repulsion-only pass ensures no two nodes overlap.
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

const REGIONS = [
  { id: 10000046, name: "Fade",       color: "#8957e5" },
  { id: 10000023, name: "Pure Blind", color: "#1f6feb" },
];

// ── Dotlan Pure Blind pixel coordinates (canvas 1024 × 768) ──────────────────
// Source: https://evemaps.dotlan.net/svg/Pure_Blind.svg
const DOTLAN_PB = {
  width: 1024, height: 768,
  systems: {
    "E-Z2ZX":  { x: 0,   y: 300 }, "7D-0SQ":  { x: 0,   y: 625 },
    "RORZ-H":  { x: 30,  y: 340 }, "KU5R-W":  { x: 30,  y: 505 },
    "H1-J33":  { x: 30,  y: 545 }, "Y-C3EQ":  { x: 30,  y: 585 },
    "VRH-H7":  { x: 55,  y: 160 }, "P-2TTL":  { x: 65,  y: 300 },
    "OGV-AS":  { x: 65,  y: 625 }, "UI-8ZE":  { x: 65,  y: 675 },
    "O-A6YN":  { x: 100, y: 339 }, "7X-VKB":  { x: 105, y: 255 },
    "O-CNPR":  { x: 115, y: 90  }, "B-9C24":  { x: 140, y: 300 },
    "Y2-6EA":  { x: 145, y: 665 }, "DT-TCD":  { x: 145, y: 715 },
    "TFA0-U":  { x: 170, y: 620 }, "F-NMX6":  { x: 205, y: 300 },
    "ZKYV-W":  { x: 205, y: 350 }, "FWA-4V":  { x: 205, y: 400 },
    "DW-T2I":  { x: 210, y: 40  }, "RZC-16":  { x: 215, y: 460 },
    "D2-HOS":  { x: 215, y: 665 }, "HPS5-C":  { x: 215, y: 715 },
    "MQ-NPY":  { x: 245, y: 620 }, "GA-P6C":  { x: 250, y: 250 },
    "7RM-N0":  { x: 275, y: 300 }, "S-MDYI":  { x: 275, y: 350 },
    "RQH-MY":  { x: 285, y: 665 }, "MT9Q-S":  { x: 320, y: 595 },
    "E-9ORY":  { x: 345, y: 90  }, "C8-CHY":  { x: 345, y: 135 },
    "ROIR-Y":  { x: 345, y: 215 }, "G95-VZ":  { x: 345, y: 255 },
    "KLY-C0":  { x: 345, y: 300 }, "CL6-ZG":  { x: 345, y: 350 },
    "RD-G2R":  { x: 350, y: 435 }, "UC3H-Y":  { x: 370, y: 500 },
    "KDV-DE":  { x: 385, y: 560 }, "J-CIJV":  { x: 415, y: 255 },
    "X-7OMU":  { x: 415, y: 300 }, "CXN1-Z":  { x: 415, y: 350 },
    "X47L-Q":  { x: 435, y: 140 }, "6GWE-A":  { x: 440, y: 590 },
    "4-ABS8":  { x: 460, y: 200 }, "J-OK0C":  { x: 460, y: 635 },
    "KQK1-2":  { x: 480, y: 85  }, "R-LW2I":  { x: 490, y: 255 },
    "B8EN-S":  { x: 490, y: 300 }, "DP-1YE":  { x: 510, y: 175 },
    "MI6O-6":  { x: 510, y: 445 }, "UR-E6D":  { x: 530, y: 115 },
    "3V8-LJ":  { x: 555, y: 300 }, "R6XN-9":  { x: 565, y: 365 },
    "L-TS8S":  { x: 565, y: 430 }, "O-BY0Y":  { x: 575, y: 80  },
    "O-N8XZ":  { x: 575, y: 485 }, "2-6TGQ":  { x: 585, y: 175 },
    "JE-D5U":  { x: 600, y: 260 }, "EWOK-K":  { x: 615, y: 560 },
    "EC-P8R":  { x: 615, y: 610 }, "5ZXX-K":  { x: 620, y: 210 },
    "2D-0SO":  { x: 640, y: 105 }, "PFU-LH":  { x: 640, y: 315 },
    "8S-0E1":  { x: 665, y: 170 }, "OE-9UF":  { x: 680, y: 260 },
    "G-M4I8":  { x: 695, y: 580 }, "U-INPD":  { x: 710, y: 10  },
    "D7T-C0":  { x: 720, y: 145 }, "93PI-4":  { x: 720, y: 620 },
    "XI-VUF":  { x: 775, y: 105 }, "R-2R0G":  { x: 780, y: 545 },
    "KI-TL0":  { x: 785, y: 150 }, "DK-FXK":  { x: 815, y: 20  },
    "JC-YX8":  { x: 815, y: 215 }, "M-YCD4":  { x: 825, y: 450 },
    "A8I-C5":  { x: 840, y: 65  }, "EL8-4Q":  { x: 845, y: 180 },
    "Q-5211":  { x: 860, y: 485 }, "N-H32Y":  { x: 870, y: 145 },
    "5-9WNU":  { x: 890, y: 225 }, "ZJET-E":  { x: 900, y: 0   },
    "XQ-PXU":  { x: 900, y: 445 }, "C-H9X7":  { x: 915, y: 95  },
    "WW-KGD":  { x: 920, y: 395 }, "CR-AQH":  { x: 920, y: 510 },
    "M-76XI":  { x: 925, y: 35  }, "12YA-2":  { x: 925, y: 275 },
    "BDV3-T":  { x: 950, y: 340 }, "ION-FG":  { x: 955, y: 170 },
  },
};

// Canvas allocation (normalised 0-1)
// Pure Blind gets the right portion, Fade the left
const PB_LEFT = 0.38, PB_RIGHT = 0.99;
const PB_TOP  = 0.02, PB_BOT   = 0.98;
const FD_LEFT = 0.01, FD_RIGHT = 0.36;
const FD_TOP  = 0.02, FD_BOT   = 0.98;

// Minimum separation between node centres (normalised)
// NODE_RX=52, NODE_RY=28 on a 4000-unit canvas → radius ≈ 0.013/0.007
// We want a comfortable gap so use ~3× the ellipse half-width
const MIN_SEP = 0.048;
const SEP_ITERS = 300;

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

// ── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(systems, constellations) {
  const pbW = PB_RIGHT - PB_LEFT;
  const pbH = PB_BOT   - PB_TOP;
  const dotW = DOTLAN_PB.width;
  const dotH = DOTLAN_PB.height;

  let pbMissing = 0;

  // ── Pure Blind: stamp Dotlan coordinates ──────────────────────────────────
  for (const sys of systems.values()) {
    if (sys.regionId !== 10000023) continue;
    const dot = DOTLAN_PB.systems[sys.name];
    if (dot) {
      sys.nx = PB_LEFT + (dot.x / dotW) * pbW;
      sys.ny = PB_TOP  + (dot.y / dotH) * pbH;
    } else {
      // Fallback: XZ projection into PB slice for any system not in Dotlan data
      pbMissing++;
      sys.nx = PB_LEFT + pbW / 2;
      sys.ny = PB_TOP  + pbH / 2;
    }
  }

  if (pbMissing) console.warn(`  ${pbMissing} Pure Blind systems had no Dotlan coordinate — placed at centre`);

  // ── Fade: XZ projection into left slice ────────────────────────────────────
  const fadeSys = [...systems.values()].filter((s) => s.regionId === 10000046);
  const fdXs = fadeSys.map((s) => s.x), fdZs = fadeSys.map((s) => s.z);
  const fdMinX = Math.min(...fdXs), fdMaxX = Math.max(...fdXs);
  const fdMinZ = Math.min(...fdZs), fdMaxZ = Math.max(...fdZs);
  const fdSpanX = fdMaxX - fdMinX || 1, fdSpanZ = fdMaxZ - fdMinZ || 1;

  const fdW = FD_RIGHT - FD_LEFT, fdH = FD_BOT - FD_TOP;
  const aspectFd = fdSpanX / fdSpanZ;
  let fdScaleX, fdScaleZ, fdOffX = 0, fdOffY = 0;
  if (aspectFd > fdW / fdH) {
    fdScaleX = fdW / fdSpanX; fdScaleZ = fdScaleX;
    fdOffY = (fdH - fdSpanZ * fdScaleZ) / 2;
  } else {
    fdScaleZ = fdH / fdSpanZ; fdScaleX = fdScaleZ;
    fdOffX = (fdW - fdSpanX * fdScaleX) / 2;
  }

  for (const sys of fadeSys) {
    sys.nx = FD_LEFT + fdOffX + ((sys.x - fdMinX) * fdScaleX);
    sys.ny = FD_TOP  + fdOffY + ((fdMaxZ - sys.z)  * fdScaleZ);
    sys.nx = Math.max(FD_LEFT, Math.min(FD_RIGHT, sys.nx));
    sys.ny = Math.max(FD_TOP,  Math.min(FD_BOT,   sys.ny));
  }

  // ── Separation pass: push overlapping nodes apart ─────────────────────────
  const sysList = [...systems.values()];
  console.log(`  Running ${SEP_ITERS} separation iterations (min gap ${MIN_SEP})…`);

  for (let iter = 0; iter < SEP_ITERS; iter++) {
    for (let i = 0; i < sysList.length; i++) {
      for (let j = i + 1; j < sysList.length; j++) {
        const si = sysList[i], sj = sysList[j];
        const dx = sj.nx - si.nx, dy = sj.ny - si.ny;
        const d  = Math.hypot(dx, dy) || 1e-9;
        if (d < MIN_SEP) {
          const push = (MIN_SEP - d) * 0.5;
          const ux = dx / d, uy = dy / d;
          si.nx -= ux * push * 0.5; si.ny -= uy * push * 0.5;
          sj.nx += ux * push * 0.5; sj.ny += uy * push * 0.5;
        }
      }
    }
    // Clamp into their respective region slices after each iter
    for (const s of systems.values()) {
      if (s.regionId === 10000023) {
        s.nx = Math.max(PB_LEFT - 0.02, Math.min(PB_RIGHT + 0.02, s.nx));
        s.ny = Math.max(0.01, Math.min(0.99, s.ny));
      } else {
        s.nx = Math.max(FD_LEFT - 0.02, Math.min(FD_RIGHT + 0.02, s.nx));
        s.ny = Math.max(0.01, Math.min(0.99, s.ny));
      }
    }
  }

  // ── Recompute constellation centres ───────────────────────────────────────
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

  console.log("Applying Dotlan positions (Pure Blind) + XZ projection (Fade)…");
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
  console.log(`\nWrote ${out.systems.length} systems, ${out.edges.length} edges`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
