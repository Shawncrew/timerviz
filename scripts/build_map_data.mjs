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
// Sectors at 30% of original size on 20000-unit canvas.
// PB_FADE left extended to 0.305 to give Fade room to the left of PB.
const SECTOR = {
  "PB_FADE": { l: 0.305, r: 0.509, t: 0.488, b: 0.644 },
  "Deklein":  { l: 0.344, r: 0.794, t: 0.356, b: 0.482 },
  "Tribute":  { l: 0.515, r: 0.794, t: 0.488, b: 0.644 },
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
  },
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
  },
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

  // ── Hardcoded Fade positions calibrated for current PB_FADE sector ──────────
  // Border Fade in this sector: VRH-H7≈(0.316,0.520) DW-T2I≈(0.347,0.496)
  // Unplaced Fade extend to the left (lower nx) of those anchors.
  const FADE_POS = {
    "K4YZ-Y":  { nx: 0.315, ny: 0.497 }, "L-SCBU":  { nx: 0.322, ny: 0.497 },
    "O1Y-ED":  { nx: 0.319, ny: 0.504 }, "X36Y-G":  { nx: 0.312, ny: 0.521 },
    "L-C3O7":  { nx: 0.310, ny: 0.511 },
    "P-33KR":  { nx: 0.360, ny: 0.496 }, "DO6H-Q":  { nx: 0.366, ny: 0.500 },
    "HHK-VL":  { nx: 0.368, ny: 0.507 }, "CR-IFM":  { nx: 0.362, ny: 0.510 },
    "I-UUI5":  { nx: 0.307, ny: 0.502 }, "MPPA-A":  { nx: 0.307, ny: 0.509 },
    "GME-PQ":  { nx: 0.307, ny: 0.516 }, "C4C-Z4":  { nx: 0.313, ny: 0.516 },
    "X5-UME":  { nx: 0.313, ny: 0.523 }, "8QMO-E":  { nx: 0.307, ny: 0.530 },
    "C-OK0R":  { nx: 0.312, ny: 0.530 }, "YKSC-A":  { nx: 0.318, ny: 0.531 },
    "0-ARFO":  { nx: 0.307, ny: 0.537 }, "8W-OSE":  { nx: 0.313, ny: 0.538 },
    "FIO1-8":  { nx: 0.319, ny: 0.539 }, "WQY-IQ":  { nx: 0.313, ny: 0.545 },
    "E9KD-N":  { nx: 0.319, ny: 0.546 },
  };
  let fadePlacedCount = 0;
  for (const sys of systems.values()) {
    if (sys.regionId !== 10000046 || placed.has(sys.id)) continue;
    const fp = FADE_POS[sys.name];
    if (fp) { sys.nx = fp.nx; sys.ny = fp.ny; }
    else     { sys.nx = pbf.l + 0.005; sys.ny = (pbf.t + pbf.b) / 2; }
    placed.add(sys.id); fadePlacedCount++;
  }
  console.log(`  Fade unplaced: ${fadePlacedCount} systems placed`);

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

}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== timerviz map data builder (4 regions) ===");
  const { systems, constellations, edges } = await fetchAll();
  console.log(`\nTotal: ${systems.size} systems, ${constellations.size} constellations, ${edges.size} edges`);

  buildLayout(systems, constellations, edges);

  const out = {
    generated: new Date().toISOString(),
    regions: REGIONS,
    constellations: Object.fromEntries([...constellations.entries()].map(([cid,c]) => [String(cid), {
      id: cid, name: c.name, regionId: c.regionId, regionName: c.regionName, color: c.color,
      centerNx: parseFloat((c.centerNx??0.5).toFixed(6)),
      centerNy: parseFloat((c.centerNy??0.5).toFixed(6)),
    }])),
    systems: [...systems.values()].sort((a,b)=>a.id-b.id).map(
      ({id,name,regionId,regionName,regionColor,constellationId,constellationName,nx,ny}) => ({
        id, name, regionId, regionName, regionColor, constellationId, constellationName,
        nx: parseFloat(nx.toFixed(6)), ny: parseFloat(ny.toFixed(6)),
      })
    ),
    edges: [...edges].map(e => { const [a,b]=e.split("-").map(Number); return {a,b}; }),
  };

  writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`\nWrote ${out.systems.length} systems, ${out.edges.length} edges`);
  console.log(`→ ${OUT_FILE}`);
}

main().catch(e => { console.error(e); process.exit(1); });
