/**
 * Build map-data.json for Pure Blind, Fade, Deklein, and Tribute.
 *
 * Layout sectors (normalised 0–1):
 *   Deklein : nx=[0.02, 0.98]  ny=[0.02, 0.44]   (upper strip)
 *   Fade    : nx=[0.02, 0.53]  ny=[0.46, 0.98]   (lower-left, shares with PB)
 *   PB      : nx=[0.02, 0.53]  ny=[0.46, 0.98]   (lower-left, via DOTLAN_MAIN)
 *   Tribute : nx=[0.55, 0.98]  ny=[0.46, 0.98]   (lower-right)
 *
 * Run: node scripts/build_map_data.mjs
 * ESI cached in scripts/esi-cache.json.
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
  { id: 10000023, name: "Pure Blind", color: "#2ecc71" },
  { id: 10000035, name: "Deklein",    color: "#e67e22" },
  { id: 10000010, name: "Tribute",    color: "#e74c3c" },
];

// ── Canvas sectors (nx/ny ranges for each region group) ─────────────────────
// Sectors at 20% of original size, centered at 0.5 on 20000-unit canvas.
const SECTOR = {
  "PB_FADE": { l: 0.396, r: 0.506, t: 0.492, b: 0.596 },
  "Deklein":  { l: 0.396, r: 0.696, t: 0.404, b: 0.488 },
  "Tribute":  { l: 0.510, r: 0.696, t: 0.492, b: 0.596 },
};

// ── Dotlan Pure Blind SVG coords (1024×768) ──────────────────────────────────
// Includes 5 Fade border systems visible on PB map.
const DOTLAN_MAIN = {
  width: 1024, height: 768,
  systems: {
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
    // Fade border systems visible on PB map
    "VRH-H7":  { x:  55, y: 160 }, "O-CNPR":  { x: 115, y:  90 },
    "DW-T2I":  { x: 210, y:  40 }, "E-9ORY":  { x: 345, y:  90 },
    "C8-CHY":  { x: 345, y: 135 },
  },
};

// ── Dotlan Deklein SVG coords (1024×768, internal systems only) ───────────────
const DOTLAN_DEK = {
  width: 1024, height: 768,
  systems: {
    "RG9-7U": { x: 61, y: 110 }, "UEJX-G": { x: 61, y: 180 },
    "3JN9-Q": { x: 81, y: 610 }, "O-2RNZ": { x: 106, y: 565 },
    "UJY-HE": { x: 131, y: 85 }, "CZDJ-1": { x: 131, y: 135 },
    "A4L-A2": { x: 131, y: 180 }, "U-TJ7Y": { x: 131, y: 225 },
    "X3-PBC": { x: 131, y: 300 }, "AGG-NR": { x: 166, y: 520 },
    "0V0R-R": { x: 176, y: 465 }, "J1AU-9": { x: 196, y: 300 },
    "LEK-N5": { x: 241, y: 500 }, "GY5-26": { x: 246, y: 105 },
    "OWXT-5": { x: 246, y: 435 }, "E3UY-6": { x: 246, y: 570 },
    "MZ1E-P": { x: 261, y: 300 }, "VPLL-N": { x: 276, y: 195 },
    "N2IS-B": { x: 276, y: 245 }, "XCBK-X": { x: 326, y: 55 },
    "3T7-M8": { x: 326, y: 300 }, "LT-DRO": { x: 331, y: 555 },
    "5W3-DG": { x: 341, y: 485 }, "8S28-3": { x: 341, y: 615 },
    "4N-BUI": { x: 366, y: 195 }, "WUZ-WM": { x: 366, y: 245 },
    "RO0-AF": { x: 391, y: 405 }, "7T6P-C": { x: 396, y: 495 },
    "9CK-KZ": { x: 401, y: 105 }, "ZOYW-O": { x: 441, y: 365 },
    "5S-KXA": { x: 451, y: 145 }, "43B-O1": { x: 451, y: 195 },
    "R8S-1K": { x: 486, y: 525 }, "YZ-UKA": { x: 496, y: 240 },
    "E-FIC0": { x: 541, y: 265 }, "T-945F": { x: 541, y: 550 },
    "FO8M-2": { x: 546, y: 490 }, "QPO-WI": { x: 556, y: 455 },
    "3QE-9Q": { x: 561, y: 305 }, "85-B52": { x: 576, y: 215 },
    "4U90-Z": { x: 611, y: 525 }, "94-H3F": { x: 616, y: 420 },
    "AD-CBT": { x: 631, y: 490 }, "MXX5-9": { x: 641, y: 285 },
    "ZZZR-5": { x: 646, y: 235 }, "XCF-8N": { x: 666, y: 390 },
    "CU9-T0": { x: 671, y: 455 }, "JU-OWQ": { x: 711, y: 275 },
    "S-DN5M": { x: 721, y: 225 }, "FMB-JP": { x: 726, y: 410 },
    "0P-F3K": { x: 741, y: 365 }, "K5F-Z2": { x: 761, y: 325 },
    "TXME-A": { x: 791, y: 420 }, "2O9G-D": { x: 801, y: 285 },
    "NC-N3F": { x: 816, y: 235 }, "I30-3A": { x: 871, y: 305 },
    "33RB-O": { x: 901, y: 165 }, "2-KF56": { x: 906, y: 395 },
    "YA0-XJ": { x: 906, y: 440 }, "DKUK-G": { x: 976, y: 65 },
    "N-TFXK": { x: 976, y: 105 }, "3OAT-Q": { x: 976, y: 145 },
    "X-Z4DA": { x: 976, y: 185 }, "C7Y-7Z": { x: 976, y: 225 },
    "II-5O9": { x: 976, y: 310 }, "VFK-IV": { x: 976, y: 350 },
    "2R-CRW": { x: 976, y: 395 }, "CCP-US": { x: 976, y: 440 },
    // Ghost (external, not in any included region)
    "Y-1918": { x: 131, y: 35 }, "9-R6GU": { x: 641, y: 570 },
    "WLF-D3": { x: 976, y: 20 },
  },
  // Systems that are external/ghosts (from adjacent regions not included)
  ghosts: new Set(["Y-1918", "9-R6GU", "WLF-D3"]),
};

// ── Dotlan Tribute SVG coords (1024×768, internal systems only) ───────────────
const DOTLAN_TRIB = {
  width: 1024, height: 768,
  systems: {
    "Y-PZHM": { x: 31, y: 55 }, "OY-UZ1": { x: 36, y: 205 },
    "9SL-K9": { x: 41, y: 90 }, "C8VC-S": { x: 41, y: 610 },
    "X-CFN6": { x: 51, y: 135 }, "NL6V-7": { x: 81, y: 325 },
    "GKP-YT": { x: 81, y: 390 }, "W-UQA5": { x: 81, y: 680 },
    "YLS8-J": { x: 86, y: 170 }, "L-VXTK": { x: 91, y: 565 },
    "GIH-ZG": { x: 121, y: 515 }, "K-6SNI": { x: 121, y: 625 },
    "DL1C-E": { x: 136, y: 195 }, "S8-NSQ": { x: 141, y: 465 },
    "0-YMBJ": { x: 146, y: 245 }, "A-DDGY": { x: 151, y: 285 },
    "F-749O": { x: 151, y: 325 }, "B-S42H": { x: 151, y: 390 },
    "XD-TOV": { x: 156, y: 580 }, "2ISU-Y": { x: 161, y: 155 },
    "PBD-0G": { x: 183, y: 660 }, "V7-FB4": { x: 186, y: 535 },
    "9GI-FB": { x: 229, y: 622 }, "Y-W1Q3": { x: 231, y: 175 },
    "UMI-KK": { x: 231, y: 240 }, "AW1-2I": { x: 231, y: 325 },
    "F-RT6Q": { x: 231, y: 390 }, "Y6-HPG": { x: 241, y: 130 },
    "L-1HKR": { x: 247, y: 671 }, "KK-L97": { x: 256, y: 90 },
    "N-FK87": { x: 266, y: 450 }, "DBT-GB": { x: 275, y: 579 },
    "N-Q5PW": { x: 291, y: 55 }, "3G-LHB": { x: 296, y: 639 },
    "U-W3WS": { x: 302, y: 690 }, "PNDN-V": { x: 331, y: 500 },
    "P-FSQE": { x: 356, y: 35 }, "TRKN-L": { x: 376, y: 285 },
    "FY0W-N": { x: 378, y: 641 }, "MJI3-8": { x: 397, y: 724 },
    "15W-GC": { x: 406, y: 505 }, "J-GAMP": { x: 406, y: 601 },
    "V0DF-2": { x: 412, y: 683 }, "H-PA29": { x: 421, y: 40 },
    "O-0ERG": { x: 441, y: 265 }, "SH1-6P": { x: 441, y: 310 },
    "E-OGL4": { x: 445, y: 563 }, "M-OEE8": { x: 464, y: 640 },
    "C2X-M5": { x: 471, y: 470 }, "N6G-H3": { x: 476, y: 115 },
    "3A1P-N": { x: 486, y: 160 }, "Q-CAB2": { x: 496, y: 200 },
    "MSHD-4": { x: 506, y: 425 }, "WH-JCA": { x: 511, y: 265 },
    "D7-ZAC": { x: 511, y: 310 }, "H-W9TY": { x: 511, y: 375 },
    "9OO-LH": { x: 551, y: 490 }, "W6VP-Y": { x: 560, y: 701 },
    "IMK-K1": { x: 596, y: 160 }, "0J3L-V": { x: 613, y: 265 },
    "NJ4X-S": { x: 641, y: 120 }, "F-G7BO": { x: 696, y: 90 },
    "P3EN-E": { x: 709, y: 698 }, "EIDI-N": { x: 710, y: 623 },
    "2CG-5V": { x: 771, y: 70 }, "DAYP-G": { x: 806, y: 555 },
    "QFF-O6": { x: 846, y: 85 }, "T-ZWA1": { x: 876, y: 145 },
    "1-GBBP": { x: 876, y: 190 }, "V-NL3K": { x: 876, y: 255 },
    "T-GCGL": { x: 876, y: 300 }, "TVN-FM": { x: 876, y: 345 },
    "4-HWWF": { x: 876, y: 470 }, "WBR5-R": { x: 876, y: 390 },
    "4GYV-Q": { x: 876, y: 430 }, "YMJG-4": { x: 876, y: 510 },
    "PM-DWE": { x: 956, y: 430 }, "C-FP70": { x: 961, y: 145 },
    "ZA0L-U": { x: 961, y: 190 }, "0MV-4W": { x: 961, y: 325 },
    // Ghost external systems from Tribute SVG (sample of adjacent regions)
    "Z-GY5S": { x: 186, y: 95 }, "92K-H2": { x: 346, y: 100 },
    "OZ-VAE": { x: 386, y: 175 }, "A-AFGR": { x: 401, y: 130 },
    "9-266Q": { x: 461, y: 75 }, "1-Y6KI": { x: 487, y: 701 },
    "UH-9ZG": { x: 526, y: 545 }, "K8X-6B": { x: 616, y: 540 },
    "G9D-XW": { x: 626, y: 65 }, "X445-5": { x: 632, y: 701 },
    "KRUN-N": { x: 696, y: 565 }, "Z-8Q65": { x: 707, y: 277 },
    "IPAY-2": { x: 710, y: 661 }, "Y5J-EU": { x: 776, y: 25 },
    "8TPX-N": { x: 796, y: 430 }, "AZBR-2": { x: 799, y: 304 },
    "V-OJEN": { x: 806, y: 655 },
  },
  // Ghost systems: external to Tribute (from adjacent regions)
  ghosts: new Set(["Z-GY5S","92K-H2","OZ-VAE","A-AFGR","9-266Q","1-Y6KI",
    "UH-9ZG","K8X-6B","G9D-XW","X445-5","KRUN-N","Z-8Q65","IPAY-2",
    "Y5J-EU","8TPX-N","AZBR-2","V-OJEN"]),
};

const MIN_SEP   = 0.0025;
const SEP_ITERS = 300;

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
          isGhost: false,
        });
      }
    }
  }
  console.log(`\nFetching stargates…`);
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

function clamp(v, lo = 0.01, hi = 0.99) { return Math.max(lo, Math.min(hi, v)); }

// ── Layout ────────────────────────────────────────────────────────────────────
function buildLayout(systems, constellations, edges) {
  const placed = new Set();

  // ── Place PB + Fade border systems (DOTLAN_MAIN → PB_FADE sector) ─────────
  const pbf = SECTOR.PB_FADE;
  for (const sys of systems.values()) {
    const dot = DOTLAN_MAIN.systems[sys.name];
    if (dot) {
      sys.nx = pbf.l + (dot.x / DOTLAN_MAIN.width)  * (pbf.r - pbf.l);
      sys.ny = pbf.t + (dot.y / DOTLAN_MAIN.height) * (pbf.b - pbf.t);
      placed.add(sys.id);
    }
  }
  console.log(`  PB+Fade border: ${placed.size} systems placed`);

  // ── Place unplaced Fade systems (greedy, left-biased within PB_FADE) ──────
  const adj = new Map();
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    if (!adj.has(a)) adj.set(a, []); if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b); adj.get(b).push(a);
  }
  const fadePlaced = [];
  for (let pass = 0; pass < 4; pass++) {
    const remaining = [...systems.values()].filter(s => s.regionId === 10000046 && !placed.has(s.id));
    remaining.sort((a, b) => {
      const an = (adj.get(a.id)||[]).filter(id => placed.has(id)).length;
      const bn = (adj.get(b.id)||[]).filter(id => placed.has(id)).length;
      return bn - an;
    });
    for (const sys of remaining) {
      const nbrs = (adj.get(sys.id)||[]).filter(id => placed.has(id)).map(id => systems.get(id));
      if (!nbrs.length && pass < 3) continue;
      const anchor = nbrs.length
        ? { nx: nbrs.reduce((s,n)=>s+n.nx,0)/nbrs.length, ny: nbrs.reduce((s,n)=>s+n.ny,0)/nbrs.length }
        : { nx: pbf.l + 0.05, ny: (pbf.t+pbf.b)/2 };

      const DISTS = [0.025,0.040,0.055,0.075,0.095];
      const ANGLES = Array.from({length:24}, (_,i) => i/24*2*Math.PI);
      let best = null, bestScore = Infinity;
      for (const dist of DISTS) {
        for (const angle of ANGLES) {
          const cnx = clamp(anchor.nx + Math.cos(angle)*dist, pbf.l, pbf.r);
          const cny = clamp(anchor.ny + Math.sin(angle)*dist, pbf.t, pbf.b);
          let tooClose = false;
          for (const [,s] of systems) {
            if (!placed.has(s.id)) continue;
            if (Math.hypot(cnx-s.nx, cny-s.ny) < MIN_SEP) { tooClose=true; break; }
          }
          if (tooClose) continue;
          const leftBias = (anchor.nx - cnx) * 3;
          const score = -leftBias + dist*5;
          if (score < bestScore) { bestScore=score; best={nx:cnx,ny:cny}; }
        }
      }
      if (best) { sys.nx=best.nx; sys.ny=best.ny; placed.add(sys.id); fadePlaced.push(sys.id); }
    }
  }
  // Fallback for any still unplaced Fade
  for (const sys of systems.values()) {
    if (sys.regionId===10000046 && !placed.has(sys.id)) {
      sys.nx = pbf.l + 0.03; sys.ny = (pbf.t+pbf.b)/2; placed.add(sys.id);
    }
  }
  console.log(`  Fade unplaced: ${fadePlaced.length} systems placed`);

  // ── Place Deklein systems (DOTLAN_DEK → Deklein sector) ───────────────────
  const dekS = SECTOR.Deklein;
  let dekCount = 0;
  for (const sys of systems.values()) {
    if (sys.regionId !== 10000035) continue;
    const dot = DOTLAN_DEK.systems[sys.name];
    if (dot) {
      sys.nx = dekS.l + (dot.x / DOTLAN_DEK.width)  * (dekS.r - dekS.l);
      sys.ny = dekS.t + (dot.y / DOTLAN_DEK.height) * (dekS.b - dekS.t);
      placed.add(sys.id); dekCount++;
    } else {
      // Deklein system not in our Dotlan data — place at center of sector
      sys.nx = (dekS.l + dekS.r) / 2; sys.ny = (dekS.t + dekS.b) / 2;
      placed.add(sys.id); dekCount++;
    }
  }
  console.log(`  Deklein: ${dekCount} systems placed`);

  // ── Place Tribute systems (DOTLAN_TRIB → Tribute sector) ──────────────────
  const tribS = SECTOR.Tribute;
  let tribCount = 0;
  for (const sys of systems.values()) {
    if (sys.regionId !== 10000010) continue;
    const dot = DOTLAN_TRIB.systems[sys.name];
    if (dot) {
      sys.nx = tribS.l + (dot.x / DOTLAN_TRIB.width)  * (tribS.r - tribS.l);
      sys.ny = tribS.t + (dot.y / DOTLAN_TRIB.height) * (tribS.b - tribS.t);
      placed.add(sys.id); tribCount++;
    } else {
      sys.nx = (tribS.l + tribS.r) / 2; sys.ny = (tribS.t + tribS.b) / 2;
      placed.add(sys.id); tribCount++;
    }
  }
  console.log(`  Tribute: ${tribCount} systems placed`);

  // ── Add ghost nodes (external systems from adjacent unincluded regions) ────
  const ghostSystems = [];

  // Deklein ghosts (from adjacent regions like Branch)
  for (const [name, dot] of Object.entries(DOTLAN_DEK.systems)) {
    if (!DOTLAN_DEK.ghosts.has(name)) continue;
    // Place slightly outside Deklein sector using its SVG position
    const nx = clamp(dekS.l + (dot.x / DOTLAN_DEK.width)  * (dekS.r - dekS.l), 0.01, 0.99);
    const ny = clamp(dekS.t + (dot.y / DOTLAN_DEK.height) * (dekS.b - dekS.t), 0.01, 0.99);
    ghostSystems.push({ id: -Math.random(), name, regionName: "External", regionColor: "#4a4a4a", constellationId: -1, constellationName: "External", nx, ny, isGhost: true });
  }

  // Tribute ghosts (from adjacent regions — Vale of Silent, Venal, etc.)
  for (const [name, dot] of Object.entries(DOTLAN_TRIB.systems)) {
    if (!DOTLAN_TRIB.ghosts.has(name)) continue;
    const nx = clamp(tribS.l + (dot.x / DOTLAN_TRIB.width)  * (tribS.r - tribS.l), 0.01, 0.99);
    const ny = clamp(tribS.t + (dot.y / DOTLAN_TRIB.height) * (tribS.b - tribS.t), 0.01, 0.99);
    ghostSystems.push({ id: -Math.random(), name, regionName: "External", regionColor: "#4a4a4a", constellationId: -1, constellationName: "External", nx, ny, isGhost: true });
  }

  // ── Global separation pass ─────────────────────────────────────────────────
  const allList = [...systems.values()];
  console.log(`  Separation pass (${SEP_ITERS} iters)…`);
  for (let iter = 0; iter < SEP_ITERS; iter++) {
    for (let i = 0; i < allList.length; i++) {
      for (let j = i+1; j < allList.length; j++) {
        const si=allList[i], sj=allList[j];
        const dx=sj.nx-si.nx, dy=sj.ny-si.ny;
        const d=Math.hypot(dx,dy)||1e-9;
        if (d < MIN_SEP) {
          const push=(MIN_SEP-d)*0.4;
          const ux=dx/d, uy=dy/d;
          const wi = placed.has(si.id)?0.12:0.5, wj=placed.has(sj.id)?0.12:0.5;
          si.nx-=ux*push*wi; si.ny-=uy*push*wi;
          sj.nx+=ux*push*wj; sj.ny+=uy*push*wj;
          si.nx=clamp(si.nx,0.01,0.99); si.ny=clamp(si.ny,0.01,0.99);
          sj.nx=clamp(sj.nx,0.01,0.99); sj.ny=clamp(sj.ny,0.01,0.99);
        }
      }
    }
  }

  // ── Recompute constellation centres ───────────────────────────────────────
  for (const [,c] of constellations) {
    const sids = c.systems.filter(id => systems.has(id));
    if (!sids.length) continue;
    c.centerNx = sids.reduce((s,id)=>s+systems.get(id).nx,0)/sids.length;
    c.centerNy = sids.reduce((s,id)=>s+systems.get(id).ny,0)/sids.length;
  }

  return ghostSystems;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder (4 regions) ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nTotal: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);

  const ghostSystems = buildLayout(systems, constellations, edges);

  // Build ghost name → id map for edge lookups (ghosts use negative ids)
  const ghostByName = new Map(ghostSystems.map(g => [g.name, g]));

  // Build ghost edges: find real system ↔ ghost connections via Dotlan SVG
  const ghostEdges = [];
  const allSystemNames = new Set([...systems.values()].map(s => s.name));
  for (const ghost of ghostSystems) {
    // Find real system that connects to this ghost (adjacent in SVG)
    // We pair ghost with the nearest real system in the same sector
    const sector = DOTLAN_DEK.ghosts.has(ghost.name) ? SECTOR.Deklein : SECTOR.Tribute;
    let nearest = null, nearestDist = Infinity;
    for (const sys of systems.values()) {
      if (sys.regionId !== (DOTLAN_DEK.ghosts.has(ghost.name) ? 10000035 : 10000010)) continue;
      const d = Math.hypot(sys.nx - ghost.nx, sys.ny - ghost.ny);
      if (d < nearestDist) { nearestDist=d; nearest=sys; }
    }
    if (nearest) ghostEdges.push({ realName: nearest.name, ghostName: ghost.name });
  }

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
    constellations: Object.fromEntries([...constellations.entries()].map(([cid,c]) => [String(cid), {
      id: cid, name: c.name, regionId: c.regionId, regionName: c.regionName, color: c.color,
      centerNx: parseFloat((c.centerNx??0.5).toFixed(6)),
      centerNy: parseFloat((c.centerNy??0.5).toFixed(6)),
    }])),
    systems: [
      ...[...systems.values()].sort((a,b)=>a.id-b.id).map(
        ({id,name,regionId,regionName,regionColor,constellationId,constellationName,nx,ny}) => ({
          id, name, regionId, regionName, regionColor, constellationId, constellationName,
          nx: parseFloat(nx.toFixed(6)), ny: parseFloat(ny.toFixed(6)), isGhost: false,
        })
      ),
      ...ghostSystems.map(g => ({
        id: g.name, name: g.name, regionId: -1, regionName: g.regionName,
        regionColor: g.regionColor, constellationId: -1, constellationName: "External",
        nx: parseFloat(g.nx.toFixed(6)), ny: parseFloat(g.ny.toFixed(6)), isGhost: true,
      })),
    ],
    edges: [
      ...[...edges].map(e => { const [a,b]=e.split("-").map(Number); return {a,b}; }),
      ...ghostEdges.map(({realName, ghostName}) => ({
        a: realName, b: ghostName, isGhost: true,
      })),
    ],
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.systems.length} systems (${ghostSystems.length} ghosts), ${out.edges.length} edges`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
