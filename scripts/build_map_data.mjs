/**
 * Build map-data.json for Pure Blind, Fade, Deklein, Tribute.
 *
 * Positioning strategy:
 *   - All systems placed in a unified "extended pixel" coordinate space
 *     derived from Dotlan SVG coordinates, anchored via shared border systems.
 *   - Pure Blind / Fade border: DOTLAN_MAIN at offset (0, 0)
 *   - Deklein: DOTLAN_DEK aligned via U-INPD (PB top-left) as anchor
 *   - Tribute: DOTLAN_TRIB aligned via KQK1-2 (PB top-centre) as anchor
 *   - Fade unplaced: hardcoded extended-pixel positions extending left of PB
 *
 *   After placing, the entire layout is scaled so the minimum pairwise
 *   distance between any two nodes equals exactly the required spacing
 *   (2 node-widths gap + 2 node radii = 6 × NODE_RX SVG units), then
 *   centered at (0.5, 0.5) on the 20 000-unit canvas.
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
  { id: 10000023, name: "Pure Blind", color: "#2ecc71" },
  { id: 10000035, name: "Deklein",    color: "#e67e22" },
  { id: 10000010, name: "Tribute",    color: "#e74c3c" },
];

// ── Node dimensions (SVG units on 20 000-unit canvas) ─────────────────────────
const MAP_SIZE = 20000;
const NODE_RX  = 52;
const NODE_RY  = 28;

// Minimum center-to-centre distance:
//   gap = 2 × node_width = 2 × (2×NODE_RX) = 208 SVG units
//   c-to-c = NODE_RX + 208 + NODE_RX = 312 SVG units
const MIN_CC_SVG = 6 * NODE_RX; // 312

// ── Extended-pixel offsets (anchor alignment) ─────────────────────────────────
//   PB origin     : (0, 0)
//   U-INPD in PB  : (710, 10)   U-INPD in DEK : (951, 540)
//   KQK1-2 in PB  : (480, 85)   KQK1-2 in TRIB: (1004, 745)
const OFF_PB   = { dx:   0, dy:   0 };
const OFF_DEK  = { dx: 710 - 951, dy:  10 - 540 }; // (-241, -530)
const OFF_TRIB = { dx: 480 - 1004, dy: 85 - 745 }; // (-524, -660)

// ── Dotlan Pure Blind SVG coords (1024 × 768) ──────────────────────────────────
const DOTLAN_MAIN = {
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

// ── Dotlan Deklein SVG coords (internal systems only) ─────────────────────────
const DOTLAN_DEK = {
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
  },
};

// ── Dotlan Tribute SVG coords (internal systems only) ─────────────────────────
const DOTLAN_TRIB = {
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
  },
};

// ── Fade unplaced: extended-pixel coords (offsets FROM VRH-H7 at PB ext 55,160) ──
// All Fade unplaced must be to the LEFT of PB (ex < 0 for most, < 55 for all).
// PB leftmost is E-Z2ZX at extended (0, 300); Fade must clear that.
// Each step ≈ 55 px in extended space (≈ 2 node-widths at target scale).
const FADE_EXT = {
  // Constellation 20000537 (directly left of VRH-H7 / O-CNPR)
  "K4YZ-Y":  { x: -110, y: -55 }, "L-SCBU":  { x:  -55, y: -55 },
  "O1Y-ED":  { x:  -82, y:  -5 }, "X36Y-G":  { x: -110, y:   0 },
  "L-C3O7":  { x: -165, y: -30 },
  // Constellation 20000536 (left of E-9ORY/C8-CHY — those are at ext x=345)
  "P-33KR":  { x:  175, y: -110 }, "DO6H-Q":  { x:  225, y:  -80 },
  "HHK-VL":  { x:  225, y:  -45 }, "CR-IFM":  { x:  175, y:  -45 },
  // Constellation 20000539 (far left column)
  "I-UUI5":  { x: -440, y: -55 }, "MPPA-A":  { x: -385, y: -55 },
  "GME-PQ":  { x: -330, y: -55 }, "C4C-Z4":  { x: -275, y: -55 },
  "X5-UME":  { x: -275, y:   0 }, "8QMO-E":  { x: -440, y:   0 },
  // Constellation 20000538 (below and left of VRH-H7)
  "C-OK0R":  { x: -110, y:  55 }, "YKSC-A":  { x:  -55, y:  55 },
  "0-ARFO":  { x: -165, y: 110 }, "8W-OSE":  { x: -110, y: 110 },
  "FIO1-8":  { x:  -55, y: 110 }, "WQY-IQ":  { x: -110, y: 165 },
  "E9KD-N":  { x:  -55, y: 165 },
};

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
  await new Promise(res => setTimeout(res, 55));
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

// ── Layout ────────────────────────────────────────────────────────────────────
function buildLayout(systems, constellations, edges) {

  // Step 1 — assign extended-pixel coords to every system
  const extPos = new Map(); // sysId → {ex, ey}

  for (const sys of systems.values()) {
    const name = sys.name;
    // PB + Fade border
    if (DOTLAN_MAIN.systems[name]) {
      const d = DOTLAN_MAIN.systems[name];
      extPos.set(sys.id, { ex: d.x + OFF_PB.dx, ey: d.y + OFF_PB.dy });
      continue;
    }
    // Deklein internal
    if (sys.regionId === 10000035 && DOTLAN_DEK.systems[name]) {
      const d = DOTLAN_DEK.systems[name];
      extPos.set(sys.id, { ex: d.x + OFF_DEK.dx, ey: d.y + OFF_DEK.dy });
      continue;
    }
    // Tribute internal
    if (sys.regionId === 10000010 && DOTLAN_TRIB.systems[name]) {
      const d = DOTLAN_TRIB.systems[name];
      extPos.set(sys.id, { ex: d.x + OFF_TRIB.dx, ey: d.y + OFF_TRIB.dy });
      continue;
    }
    // Fade unplaced
    if (sys.regionId === 10000046 && FADE_EXT[name]) {
      // FADE_EXT coords are offsets relative to VRH-H7's PB extended position (55, 160)
      extPos.set(sys.id, { ex: 55 + FADE_EXT[name].x, ey: 160 + FADE_EXT[name].y });
      continue;
    }
    // Fallback: place at PB centre
    console.warn(`  No extended position for: ${name} (${sys.regionName})`);
    extPos.set(sys.id, { ex: 480, ey: 400 });
  }

  // Step 2 — find minimum distance between ADJACENT (gate-connected) systems only.
  // Using only adjacent distances keeps the Dotlan topology while avoiding accidental
  // overlaps between non-adjacent systems from different regions inflating the scale.
  let minAdj = Infinity;
  for (const e of edges) {
    const [a, b] = e.split("-").map(Number);
    const pa = extPos.get(a), pb2 = extPos.get(b);
    if (!pa || !pb2) continue;
    const d = Math.hypot(pb2.ex - pa.ex, pb2.ey - pa.ey);
    if (d > 0) minAdj = Math.min(minAdj, d);
  }
  console.log(`  Min adjacent distance in extended space: ${minAdj.toFixed(1)} px`);

  // Step 3 — compute scale: map minAdj → MIN_CC_SVG,
  // but cap so the whole layout fits within 70% of MAP_SIZE.
  const allEx2 = [...extPos.values()].map(p => p.ex);
  const allEy2 = [...extPos.values()].map(p => p.ey);
  const rawSpanX = Math.max(...allEx2) - Math.min(...allEx2);
  const rawSpanY = Math.max(...allEy2) - Math.min(...allEy2);
  const maxSpan  = Math.max(rawSpanX, rawSpanY);
  const scaleBySpacing = MIN_CC_SVG / minAdj;
  const scaleByCanvas  = (MAP_SIZE * 0.35) / maxSpan;
  const scale = Math.min(scaleBySpacing, scaleByCanvas);
  console.log(`  Scale factor: ${scale.toFixed(3)}  (spacing-driven: ${scaleBySpacing.toFixed(2)}, canvas-cap: ${scaleByCanvas.toFixed(2)})`);

  // Step 4 — apply scale and centre at (0.5, 0.5)
  const cxExt = (Math.min(...allEx2) + Math.max(...allEx2)) / 2;
  const cyExt = (Math.min(...allEy2) + Math.max(...allEy2)) / 2;

  for (const sys of systems.values()) {
    const p = extPos.get(sys.id);
    sys.nx = 0.5 + (p.ex - cxExt) * scale / MAP_SIZE;
    sys.ny = 0.5 + (p.ey - cyExt) * scale / MAP_SIZE;
    sys.nx = Math.max(0.001, Math.min(0.999, sys.nx));
    sys.ny = Math.max(0.001, Math.min(0.999, sys.ny));
  }

  // Step 5 — separation pass: enforce minimum c-to-c = MIN_CC_SVG
  // Only pushes overlapping nodes apart; doesn't pull them together.
  const MIN_SEP_N = MIN_CC_SVG / MAP_SIZE; // in normalised space
  const sysList = [...systems.values()];
  for (let iter = 0; iter < 200; iter++) {
    for (let i = 0; i < sysList.length; i++) {
      for (let j = i + 1; j < sysList.length; j++) {
        const si = sysList[i], sj = sysList[j];
        const dx = sj.nx - si.nx, dy = sj.ny - si.ny;
        const d  = Math.hypot(dx, dy) || 1e-9;
        if (d < MIN_SEP_N) {
          const push = (MIN_SEP_N - d) * 0.5;
          const ux = dx / d, uy = dy / d;
          si.nx -= ux * push * 0.5; si.ny -= uy * push * 0.5;
          sj.nx += ux * push * 0.5; sj.ny += uy * push * 0.5;
          si.nx = Math.max(0.001, Math.min(0.999, si.nx));
          si.ny = Math.max(0.001, Math.min(0.999, si.ny));
          sj.nx = Math.max(0.001, Math.min(0.999, sj.nx));
          sj.ny = Math.max(0.001, Math.min(0.999, sj.ny));
        }
      }
    }
  }

  // Step 6 — recompute constellation centres
  for (const [, c] of constellations) {
    const sids = c.systems.filter(id => systems.has(id));
    if (!sids.length) continue;
    c.centerNx = sids.reduce((s, id) => s + systems.get(id).nx, 0) / sids.length;
    c.centerNy = sids.reduce((s, id) => s + systems.get(id).ny, 0) / sids.length;
  }

  const spanX = rawSpanX * scale;
  const spanY = rawSpanY * scale;
  console.log(`  Layout SVG span: ${spanX.toFixed(0)} × ${spanY.toFixed(0)} (canvas ${MAP_SIZE} × ${MAP_SIZE})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nTotal: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);

  buildLayout(systems, constellations, edges);

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
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
    edges: [...edges].map(e => { const [a, b] = e.split("-").map(Number); return { a, b }; }),
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.systems.length} systems, ${out.edges.length} edges`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
