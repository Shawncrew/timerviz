/**
 * Apply hand-tuned Dotlan positions from the reference project's dotlan-layout.json
 * to timerviz/static/timerviz/map-data.json.
 *
 * Run: node scripts/apply_dotlan_layout.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const DOTLAN_SRC = "D:\\Development\\timerboardviz\\dotlan-layout.json";
const MAP_FILE   = join(__dirname, "..", "timerviz", "static", "timerviz", "map-data.json");

const dotlan  = JSON.parse(readFileSync(DOTLAN_SRC, "utf8"));
const mapData = JSON.parse(readFileSync(MAP_FILE, "utf8"));

let updated = 0, missing = 0;

for (const sys of mapData.systems) {
  const pos = dotlan.positions[sys.name];
  if (pos) {
    sys.nx = parseFloat(pos.nx.toFixed(6));
    sys.ny = parseFloat(pos.ny.toFixed(6));
    updated++;
  } else {
    console.warn(`  No Dotlan position for: ${sys.name}`);
    missing++;
  }
}

// Also update constellation center positions to match
for (const [cidStr, c] of Object.entries(mapData.constellations)) {
  const sids = mapData.systems.filter((s) => s.constellationId === parseInt(cidStr, 10));
  if (!sids.length) continue;
  c.centerNx = parseFloat((sids.reduce((s, x) => s + x.nx, 0) / sids.length).toFixed(6));
  c.centerNy = parseFloat((sids.reduce((s, x) => s + x.ny, 0) / sids.length).toFixed(6));
}

mapData.generated = new Date().toISOString();
writeFileSync(MAP_FILE, JSON.stringify(mapData, null, 2));
console.log(`Done — updated ${updated} systems, ${missing} missing.`);
console.log(`→ ${MAP_FILE}`);
