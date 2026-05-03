/**
 * timerviz.js — Alliance Auth structure timer map visualization
 */

const CFG = window.TIMERVIZ_CONFIG;

// ── Constants ────────────────────────────────────────────────────────────────

const REPAIR_MS = CFG.repairWindowMin * 60 * 1000;
const SVG_NS    = "http://www.w3.org/2000/svg";
const MAP_SIZE  = 4000;
const NODE_RX   = 52;
const NODE_RY   = 28;
const POLL_MS   = 10_000;

// ── State ────────────────────────────────────────────────────────────────────

let timers            = [];
let mapData           = null;
let customPositions   = {};
let upcomingWindowMin = CFG.upcomingWindowMin;
let filterObjective   = "";
let hiddenRegions     = new Set(JSON.parse(localStorage.getItem("tv-hidden-regions") || "[]"));
let showConstLabels   = localStorage.getItem("tv-const-labels") !== "false";

// Interaction state machine — one of: null | pan | selBox | singleDrag | groupDrag
let ix = null;

// Selection (configure users only)
let selectionMode  = false;   // toggle via toolbar button
let selectedIds    = new Set(); // selected system IDs

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  mapData = await fetch(CFG.mapDataUrl).then((r) => r.json());

  if (CFG.positionsUrl) {
    try {
      const pd = await fetch(CFG.positionsUrl).then((r) => r.json());
      customPositions = pd.positions || {};
    } catch (e) {
      console.warn("timerviz: could not load positions", e);
    }
  }

  applyCustomPositions();
  buildMap();
  await fetchTimers();
  setInterval(fetchTimers, POLL_MS);
  setInterval(tick, 1000);
  tick();
  initControls();
}

function applyCustomPositions() {
  for (const sys of mapData.systems) {
    if (customPositions[sys.name]) {
      sys.nx = customPositions[sys.name].nx;
      sys.ny = customPositions[sys.name].ny;
    }
  }
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function fetchTimers() {
  try {
    const data = await fetch(CFG.timerDataUrl).then((r) => r.json());
    timers            = data.timers;
    upcomingWindowMin = data.upcoming_window_min;
    document.getElementById("tv-upcoming-window").value = upcomingWindowMin;
    render();
  } catch (e) {
    console.error("timerviz: fetch failed", e);
  }
}

async function confirmRepair(timerId) {
  const url = CFG.confirmRepairUrlTemplate.replace("{id}", timerId);
  try {
    await fetch(url, { method: "POST", headers: { "X-CSRFToken": CFG.csrfToken } });
    await fetchTimers();
  } catch (e) {
    console.error("timerviz: confirm repair failed", e);
  }
}

async function savePosition(systemName, nx, ny) {
  try {
    await fetch(CFG.positionsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": CFG.csrfToken },
      body: JSON.stringify({ system_name: systemName, nx, ny }),
    });
    customPositions[systemName] = { nx, ny };
  } catch (e) {
    console.error("timerviz: save position failed", e);
  }
}

async function savePositions(systems) {
  // Save multiple positions; fire sequentially to avoid hammering the server
  for (const sys of systems) {
    await savePosition(sys.name, sys.nx, sys.ny);
  }
}

async function resetAllPositions() {
  try {
    await fetch(CFG.positionsResetUrl, {
      method: "POST",
      headers: { "X-CSRFToken": CFG.csrfToken },
      body: JSON.stringify({}),
    });
    customPositions = {};
    mapData = await fetch(CFG.mapDataUrl).then((r) => r.json());
    selectedIds.clear();
    document.getElementById("tv-map").innerHTML = "";
    buildMap();
    renderMapTimers();
  } catch (e) {
    console.error("timerviz: reset positions failed", e);
  }
}

// ── Timer state helpers ───────────────────────────────────────────────────────

function timerState(t, now) {
  if (t.confirmed) return "confirmed";
  const fireMs = new Date(t.eve_time).getTime(), elapsed = now - fireMs;
  if (elapsed < 0) return (-elapsed <= upcomingWindowMin * 60 * 1000) ? "upcoming" : "future";
  return elapsed < REPAIR_MS ? "repairing" : "elapsed";
}

function countdownText(t, now) {
  if (t.confirmed) return "Confirmed";
  const diff = new Date(t.eve_time).getTime() - now;
  if (diff > 0) return "T-" + fmtDuration(diff);
  const since = -diff;
  return since < REPAIR_MS ? "Repairing " + fmtDuration(REPAIR_MS - since) : "Awaiting confirmation";
}

function shortCountdown(t, now) {
  if (t.confirmed) return "✓";
  const diff = new Date(t.eve_time).getTime() - now;
  if (diff > 0) return "T-" + shortDur(diff);
  const since = -diff;
  return since < REPAIR_MS ? "Rep " + shortDur(REPAIR_MS - since) : "Confirm";
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(sec)}s`;
  if (m > 0) return `${m}m ${pad2(sec)}s`;
  return `${sec}s`;
}
function shortDur(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${pad2(m)}m` : `${m}m${pad2(s % 60)}s`;
}
function pad2(n) { return String(n).padStart(2, "0"); }

// ── Tick ─────────────────────────────────────────────────────────────────────

function tick() {
  const now = Date.now();
  const clockEl = document.getElementById("tv-clock");
  if (clockEl) clockEl.textContent = "EVE " + new Date(now).toISOString().slice(11, 19) + " UTC";

  document.querySelectorAll(".tv-timer-card[data-timer-id]").forEach((card) => {
    const t = timers.find((x) => x.id === parseInt(card.dataset.timerId, 10));
    if (!t) return;
    card.className = "tv-timer-card tv-" + timerState(t, now);
    const cdEl = card.querySelector(".tv-card-countdown");
    if (cdEl) cdEl.textContent = countdownText(t, now);
  });

  document.querySelectorAll(".tv-map-timer-badge[data-timer-id]").forEach((g) => {
    const t = timers.find((x) => x.id === parseInt(g.dataset.timerId, 10));
    if (!t) return;
    g.className.baseVal = "tv-map-timer-badge tv-badge-" + timerState(t, now);
    const textEl = g.querySelector(".tv-map-badge-text");
    if (textEl) textEl.textContent = shortCountdown(t, now);
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() { renderSidebar(); renderMapTimers(); }

function visibleTimers() {
  const now = Date.now();
  return timers.filter((t) => {
    if (filterObjective && t.objective !== filterObjective) return false;
    const sys = mapData?.systems.find((s) => s.name === t.system);
    if (sys && hiddenRegions.has(sys.regionName)) return false;
    return timerState(t, now) !== "future";
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar() {
  const now  = Date.now();
  const list = document.getElementById("tv-timer-list");
  const shown = visibleTimers().sort((a, b) => new Date(a.eve_time) - new Date(b.eve_time));
  list.innerHTML = "";
  if (!shown.length) { list.innerHTML = '<div style="padding:12px;color:#8b949e;font-size:0.8rem;">No active timers</div>'; return; }

  for (const t of shown) {
    const state = timerState(t, now);
    const card  = document.createElement("div");
    card.className = "tv-timer-card tv-" + state;
    card.dataset.timerId = t.id;
    const sys = mapData?.systems.find((s) => s.name === t.system);
    card.innerHTML = `
      <div class="tv-card-system">
        <span class="tv-region-pip" style="background:${sys?.regionColor ?? "#8b949e"}"></span>
        ${escHtml(t.system)}
        ${t.objective ? `<span class="tv-obj-badge" style="background:${objectiveColor(t.objective)}">${escHtml(t.objective)}</span>` : ""}
      </div>
      <div class="tv-card-meta">${escHtml(t.structure)}${t.timer_type ? " · " + escHtml(t.timer_type) : ""}${t.planet_moon ? " · " + escHtml(t.planet_moon) : ""}</div>
      ${t.details ? `<div class="tv-card-meta">${escHtml(t.details)}</div>` : ""}
      <div class="tv-card-countdown">${countdownText(t, now)}</div>
      ${state === "elapsed" && CFG.canConfirm ? `<div class="tv-card-confirm-hint">↑ Click to confirm repaired</div>` : ""}
    `;
    if (state === "elapsed" && CFG.canConfirm) card.addEventListener("click", () => confirmRepair(t.id));
    list.appendChild(card);
  }
}

function objectiveColor(obj) {
  return obj === "Hostile" ? "#da3633" : obj === "Friendly" ? "#238636" : "#6e7681";
}

// ── Map build ─────────────────────────────────────────────────────────────────

function buildMap() {
  const svg = document.getElementById("tv-map");
  svg.setAttribute("viewBox", `0 0 ${MAP_SIZE} ${MAP_SIZE}`);
  const regionNames = [...new Set(mapData.systems.map((s) => s.regionName))];
  document.getElementById("tv-region-label").textContent = regionNames.join(" · ");

  svg.appendChild(createEl("g", { id: "tv-const-hulls" }));


  // ── Edges ───────────────────────────────────────────────────────────────────
  const edgeG = createEl("g", { id: "tv-edges" });
  for (const e of mapData.edges) {
    const sA = mapData.systems.find((s) => s.id === e.a);
    const sB = mapData.systems.find((s) => s.id === e.b);
    if (!sA || !sB) continue;
    edgeG.appendChild(createEl("line", {
      id: `tv-edge-${e.a}-${e.b}`,
      class: sA.regionId !== sB.regionId ? "tv-edge tv-edge-inter" : "tv-edge",
      x1: sA.nx * MAP_SIZE, y1: sA.ny * MAP_SIZE,
      x2: sB.nx * MAP_SIZE, y2: sB.ny * MAP_SIZE,
      "data-sys-a": sA.id, "data-sys-b": sB.id,
    }));
  }
  svg.appendChild(edgeG);

  // ── Nodes ───────────────────────────────────────────────────────────────────
  const nodeG = createEl("g", { id: "tv-nodes" });
  for (const sys of mapData.systems) {
    nodeG.appendChild(buildSystemNode(sys));
  }
  svg.appendChild(nodeG);

  // Selection rubber-band box (invisible until used)
  const selBox = createEl("rect", {
    id: "tv-sel-box", class: "tv-sel-box",
    x: 0, y: 0, width: 0, height: 0, display: "none",
  });
  svg.appendChild(selBox);

  buildConstellationHulls(document.getElementById("tv-const-hulls"));
  applyRegionVisibility();
  initPointerHandling(svg);
  applyViewBox();
}

// ── Color utilities ───────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

function mixColor(hex, base, t) {
  // blend hex toward base by factor t (0=hex, 1=base)
  const [r1,g1,b1] = hexToRgb(hex), [r2,g2,b2] = hexToRgb(base);
  return rgbToHex(r1*(1-t)+r2*t, g1*(1-t)+g2*t, b1*(1-t)+b2*t);
}

function lighten(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt);
}

function darken(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amt), g * (1 - amt), b * (1 - amt));
}

// ── System node builder ───────────────────────────────────────────────────────

function buildSystemNode(sys) {
  const cx = sys.nx * MAP_SIZE, cy = sys.ny * MAP_SIZE;
  const fillColor   = mixColor(sys.regionColor, "#0d1117", 0.45); // region-tinted dark fill
  const strokeColor = lighten(sys.regionColor, 0.5);               // bright stroke

  const g = createEl("g", {
    id: "tv-sys-" + sys.id, "data-system": sys.name,
    "data-sys-id": sys.id, class: "tv-system-group",
  });

  // Outer glow halo
  g.appendChild(createEl("ellipse", {
    class: "tv-node-glow", cx, cy,
    rx: NODE_RX + 14, ry: NODE_RY + 14,
    fill: sys.regionColor, "fill-opacity": "0.22",
    style: `filter: blur(10px)`,
  }));

  // Main node body
  g.appendChild(createEl("ellipse", {
    class: "tv-system-node", cx, cy, rx: NODE_RX, ry: NODE_RY,
    fill: fillColor,
    stroke: strokeColor, "stroke-width": "4",
    "data-base-stroke": strokeColor,
    "data-region-color": sys.regionColor,
    style: `filter: drop-shadow(0 0 8px ${sys.regionColor})`,
  }));

  // System name label
  const lbl = createEl("text", { class: "tv-system-label", x: cx, y: cy });
  lbl.textContent = sys.name;
  g.appendChild(lbl);

  g.appendChild(createEl("g", { id: "tv-badges-" + sys.id, class: "tv-badge-group" }));
  return g;
}

// ── Constellation hulls ───────────────────────────────────────────────────────

function convexHull(pts) {
  if (pts.length < 3) return pts;
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O, A, B) => (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop(); upper.push(p); }
  upper.pop(); lower.pop();
  return [...lower, ...upper];
}

function expandHull(hull, pad) {
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const len = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / len) * pad, y + ((y - cy) / len) * pad];
  });
}

function buildConstellationHulls(hullG) {
  hullG.innerHTML = "";
  if (!mapData.constellations) return;
  for (const [cidStr, c] of Object.entries(mapData.constellations)) {
    const sids = mapData.systems.filter((s) => s.constellationId === parseInt(cidStr, 10));
    if (sids.length < 2) continue;
    const pts = sids.map((s) => [s.nx * MAP_SIZE, s.ny * MAP_SIZE]);
    let hull = convexHull(pts);
    if (hull.length < 3) hull = pts;
    hullG.appendChild(createEl("polygon", {
      class: "tv-const-hull", id: "tv-hull-" + cidStr,
      points: expandHull(hull, NODE_RX + 20).map((p) => p.join(",")).join(" "),
      "data-region": c.regionName, style: `fill:${c.color}`,
    }));
  }
}

// ── Map timer badges ──────────────────────────────────────────────────────────

function renderMapTimers() {
  const now = Date.now();
  const bySystem = {};
  for (const t of visibleTimers()) {
    const state = timerState(t, now);
    if (state === "confirmed") continue;
    if (!bySystem[t.system]) bySystem[t.system] = [];
    bySystem[t.system].push({ t, state });
  }

  for (const sys of mapData.systems) {
    if (hiddenRegions.has(sys.regionName)) continue;
    const nodeEl  = document.querySelector(`#tv-sys-${sys.id} .tv-system-node`);
    const labelEl = document.querySelector(`#tv-sys-${sys.id} .tv-system-label`);
    const badgeG  = document.getElementById("tv-badges-" + sys.id);
    if (!badgeG) continue;
    badgeG.innerHTML = "";
    const entries = bySystem[sys.name] || [];

    if (!entries.length) {
      if (nodeEl) { nodeEl.setAttribute("stroke", nodeEl.dataset.baseStroke || sys.regionColor); nodeEl.className.baseVal = "tv-system-node"; }
      if (labelEl) labelEl.className.baseVal = "tv-system-label";
      continue;
    }

    const priority = ["repairing", "elapsed", "upcoming"];
    const dominant = priority.find((p) => entries.some((e) => e.state === p)) ?? entries[0].state;
    if (nodeEl) { nodeEl.setAttribute("stroke", stateStroke(dominant)); nodeEl.className.baseVal = "tv-system-node tv-has-timer tv-node-" + dominant; }
    if (labelEl) labelEl.className.baseVal = "tv-system-label tv-has-timer";

    const cx = sys.nx * MAP_SIZE, baseCy = sys.ny * MAP_SIZE + NODE_RY + 12;
    const badgeW = 108, badgeH = 28, gap = 4;
    entries.forEach(({ t, state }, i) => {
      const bx = cx - badgeW / 2, by = baseCy + i * (badgeH + gap);
      const g = createEl("g", { class: "tv-map-timer-badge tv-badge-" + state, "data-timer-id": t.id });
      g.appendChild(createEl("rect", { class: "tv-map-badge-rect", x: bx, y: by, width: badgeW, height: badgeH, rx: 6, ry: 6 }));
      const txt = createEl("text", { class: "tv-map-badge-text", x: bx + badgeW / 2, y: by + badgeH / 2 });
      txt.textContent = shortCountdown(t, now);
      g.appendChild(txt);
      if (state === "elapsed" && CFG.canConfirm) { g.style.cursor = "pointer"; g.addEventListener("click", () => confirmRepair(t.id)); }
      badgeG.appendChild(g);
    });
  }
}

function stateStroke(state) {
  return { upcoming: "#1f6feb", repairing: "#da3633", elapsed: "#e3b341", confirmed: "#238636" }[state] ?? "#30363d";
}

// ── Move a single system node (update SVG elements) ───────────────────────────

function moveSystemNode(sys) {
  const cx = sys.nx * MAP_SIZE, cy = sys.ny * MAP_SIZE;
  const g  = document.getElementById("tv-sys-" + sys.id);
  if (!g) return;
  const ellipse = g.querySelector(".tv-system-node");
  if (ellipse) { ellipse.setAttribute("cx", cx); ellipse.setAttribute("cy", cy); }
  const lbl = g.querySelector(".tv-system-label");
  if (lbl) { lbl.setAttribute("x", cx); lbl.setAttribute("y", cy); }

  document.querySelectorAll(`line[data-sys-a="${sys.id}"]`).forEach((l) => { l.setAttribute("x1", cx); l.setAttribute("y1", cy); });
  document.querySelectorAll(`line[data-sys-b="${sys.id}"]`).forEach((l) => { l.setAttribute("x2", cx); l.setAttribute("y2", cy); });

  const badgeG = document.getElementById("tv-badges-" + sys.id);
  if (badgeG) {
    const baseCy = cy + NODE_RY + 12, badgeW = 108, badgeH = 28, gap = 4;
    badgeG.querySelectorAll(".tv-map-timer-badge").forEach((badge, i) => {
      const rect = badge.querySelector(".tv-map-badge-rect");
      const txt  = badge.querySelector(".tv-map-badge-text");
      const bx = cx - badgeW / 2, by = baseCy + i * (badgeH + gap);
      if (rect) { rect.setAttribute("x", bx); rect.setAttribute("y", by); }
      if (txt)  { txt.setAttribute("x", bx + badgeW / 2); txt.setAttribute("y", by + badgeH / 2); }
    });
  }
}

// ── Selection helpers ─────────────────────────────────────────────────────────

function selectSystem(sysId, on) {
  const g = document.getElementById("tv-sys-" + sysId);
  if (!g) return;
  if (on) { selectedIds.add(sysId); g.classList.add("tv-selected"); }
  else    { selectedIds.delete(sysId); g.classList.remove("tv-selected"); }
}

function clearSelection() {
  for (const id of [...selectedIds]) selectSystem(id, false);
}

function selectByRect(x1, y1, x2, y2) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  let count = 0;
  for (const sys of mapData.systems) {
    const cx = sys.nx * MAP_SIZE, cy = sys.ny * MAP_SIZE;
    const inside = cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
    if (inside) { selectSystem(sys.id, true); count++; }
  }
  return count;
}

// ── Unified pointer handling ──────────────────────────────────────────────────

function svgPt(svg, cx, cy) {
  const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function initPointerHandling(svg) {
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tv-map-timer-badge")) return;

    const nodeGroup = e.target.closest(".tv-system-group");
    const pt = svgPt(svg, e.clientX, e.clientY);

    if (nodeGroup && CFG.canConfigure) {
      // ── Node interaction ───────────────────────────────
      const sysId = parseInt(nodeGroup.dataset.sysId, 10);

      if (e.shiftKey) {
        // Shift-click: toggle this node in selection
        selectSystem(sysId, !selectedIds.has(sysId));
        return;
      }

      // If clicking a selected node (and >1 selected) → group drag
      if (selectedIds.has(sysId) && selectedIds.size > 1) {
        e.stopPropagation();
        ix = {
          type: "groupDrag",
          startX: pt.x, startY: pt.y, moved: false,
          members: [...selectedIds].map((id) => {
            const s = mapData.systems.find((x) => x.id === id);
            return { sys: s, origNx: s.nx, origNy: s.ny };
          }),
        };
        svg.setPointerCapture(e.pointerId);
        svg.style.cursor = "grabbing";
        return;
      }

      // Otherwise → single node drag
      e.stopPropagation();
      const sys = mapData.systems.find((s) => s.id === sysId);
      if (!sys) return;
      ix = { type: "singleDrag", sys, startX: pt.x, startY: pt.y, origNx: sys.nx, origNy: sys.ny, moved: false };
      nodeGroup.setPointerCapture(e.pointerId);
      nodeGroup.style.cursor = "grabbing";
      return;
    }

    // ── Background interaction ─────────────────────────
    if (CFG.canConfigure && selectionMode) {
      // Draw selection rectangle
      if (!e.shiftKey) clearSelection();
      ix = { type: "selBox", startX: pt.x, startY: pt.y, curX: pt.x, curY: pt.y };
      const box = document.getElementById("tv-sel-box");
      box.setAttribute("x", pt.x); box.setAttribute("y", pt.y);
      box.setAttribute("width", 0); box.setAttribute("height", 0);
      box.removeAttribute("display");
      svg.setPointerCapture(e.pointerId);
    } else {
      // Pan
      ix = { type: "pan", startX: pt.x, startY: pt.y };
      svg.setPointerCapture(e.pointerId);
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!ix) return;
    const pt = svgPt(svg, e.clientX, e.clientY);

    if (ix.type === "pan") {
      vb.x -= pt.x - ix.startX; vb.y -= pt.y - ix.startY;
      applyViewBox();
      // recalc start after viewBox update
      ix.startX = svgPt(svg, e.clientX, e.clientY).x;
      ix.startY = svgPt(svg, e.clientX, e.clientY).y;

    } else if (ix.type === "selBox") {
      ix.curX = pt.x; ix.curY = pt.y;
      const x = Math.min(ix.startX, pt.x), y = Math.min(ix.startY, pt.y);
      const w = Math.abs(pt.x - ix.startX), h = Math.abs(pt.y - ix.startY);
      const box = document.getElementById("tv-sel-box");
      box.setAttribute("x", x); box.setAttribute("y", y);
      box.setAttribute("width", w); box.setAttribute("height", h);

    } else if (ix.type === "singleDrag") {
      const dx = pt.x - ix.startX, dy = pt.y - ix.startY;
      if (Math.hypot(dx, dy) < 2) return;
      ix.moved = true;
      ix.sys.nx = Math.max(0.001, Math.min(0.999, ix.origNx + dx / MAP_SIZE));
      ix.sys.ny = Math.max(0.001, Math.min(0.999, ix.origNy + dy / MAP_SIZE));
      moveSystemNode(ix.sys);

    } else if (ix.type === "groupDrag") {
      const dx = pt.x - ix.startX, dy = pt.y - ix.startY;
      if (Math.hypot(dx, dy) < 2) return;
      ix.moved = true;
      for (const { sys, origNx, origNy } of ix.members) {
        sys.nx = Math.max(0.001, Math.min(0.999, origNx + dx / MAP_SIZE));
        sys.ny = Math.max(0.001, Math.min(0.999, origNy + dy / MAP_SIZE));
        moveSystemNode(sys);
      }
    }
  });

  svg.addEventListener("pointerup", async (e) => {
    if (!ix) return;
    const type = ix.type;
    const state = ix;
    ix = null;
    svg.style.cursor = "";

    if (type === "selBox") {
      const box = document.getElementById("tv-sel-box");
      box.setAttribute("display", "none");
      selectByRect(
        Math.min(state.startX, state.curX), Math.min(state.startY, state.curY),
        Math.max(state.startX, state.curX), Math.max(state.startY, state.curY),
      );
      updateSelectionLabel();

    } else if (type === "singleDrag") {
      const nodeGroup = document.getElementById("tv-sys-" + state.sys.id);
      if (nodeGroup) nodeGroup.style.cursor = "";
      if (state.moved) {
        await savePosition(state.sys.name, state.sys.nx, state.sys.ny);
        buildConstellationHulls(document.getElementById("tv-const-hulls"));
        renderMapTimers();
      }

    } else if (type === "groupDrag") {
      if (state.moved) {
        await savePositions(state.members.map((m) => m.sys));
        buildConstellationHulls(document.getElementById("tv-const-hulls"));
        renderMapTimers();
      }
    }
  });

  svg.addEventListener("pointercancel", () => {
    ix = null;
    const box = document.getElementById("tv-sel-box");
    if (box) box.setAttribute("display", "none");
    svg.style.cursor = "";
  });

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pt = svgPt(svg, e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 0.87, pt.x, pt.y);
  }, { passive: false });
}

// ── Pan / Zoom ────────────────────────────────────────────────────────────────

let vb = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };

function applyViewBox() {
  document.getElementById("tv-map").setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function zoom(factor, cx, cy) {
  const newW = Math.min(16000, Math.max(400, vb.w * factor));
  const pX = cx ?? vb.x + vb.w / 2, pY = cy ?? vb.y + vb.h / 2;
  vb.x = pX - (pX - vb.x) * (newW / vb.w);
  vb.y = pY - (pY - vb.y) * (newW / vb.h);
  vb.w = newW; vb.h = newW;
  applyViewBox();
}

// ── Region visibility ─────────────────────────────────────────────────────────

function applyRegionVisibility() {
  for (const sys of mapData.systems) {
    const g = document.getElementById("tv-sys-" + sys.id);
    if (g) g.style.display = hiddenRegions.has(sys.regionName) ? "none" : "";
  }
  document.querySelectorAll(".tv-edge[data-sys-a]").forEach((line) => {
    const sA = mapData.systems.find((s) => s.id === parseInt(line.dataset.sysA, 10));
    const sB = mapData.systems.find((s) => s.id === parseInt(line.dataset.sysB, 10));
    line.style.display = (sA && hiddenRegions.has(sA.regionName)) && (sB && hiddenRegions.has(sB.regionName)) ? "none" : "";
  });
  document.querySelectorAll(".tv-const-hull, .tv-const-label").forEach((el) => {
    el.style.display = hiddenRegions.has(el.dataset.region) ? "none" : "";
  });
}

// ── Controls ──────────────────────────────────────────────────────────────────

function updateSelectionLabel() {
  const btn = document.getElementById("tv-select-toggle");
  if (!btn) return;
  if (selectedIds.size > 0) {
    btn.textContent = `Select (${selectedIds.size} selected)`;
    btn.classList.add("btn-warning");
    btn.classList.remove("btn-secondary");
  } else {
    btn.textContent = selectionMode ? "Select: ON" : "Select";
    btn.classList.toggle("btn-warning", selectionMode);
    btn.classList.toggle("btn-secondary", !selectionMode);
  }
}

function initControls() {
  document.getElementById("tv-zoom-in").addEventListener("click",    () => zoom(0.75));
  document.getElementById("tv-zoom-out").addEventListener("click",   () => zoom(1.35));
  document.getElementById("tv-zoom-reset").addEventListener("click", () => {
    vb = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE }; applyViewBox();
  });

  document.getElementById("tv-filter-objective").addEventListener("change", (e) => {
    filterObjective = e.target.value; render();
  });
  document.getElementById("tv-upcoming-window").addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1) { upcomingWindowMin = v; render(); }
  });

  if (CFG.canConfigure) {
    // Select mode toggle
    const selBtn = document.getElementById("tv-select-toggle");
    if (selBtn) {
      selBtn.addEventListener("click", () => {
        selectionMode = !selectionMode;
        if (!selectionMode) clearSelection();
        updateSelectionLabel();
        document.getElementById("tv-map").style.cursor = selectionMode ? "crosshair" : "";
      });
    }

    // Clear selection button
    const clearBtn = document.getElementById("tv-clear-selection");
    if (clearBtn) clearBtn.addEventListener("click", () => { clearSelection(); updateSelectionLabel(); });

    // Region toggles
    const container = document.getElementById("tv-region-toggles");
    if (container && mapData?.regions) {
      for (const reg of mapData.regions) {
        const label = document.createElement("label");
        label.className = "tv-region-toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox"; cb.checked = !hiddenRegions.has(reg.name);
        cb.addEventListener("change", () => {
          if (cb.checked) hiddenRegions.delete(reg.name); else hiddenRegions.add(reg.name);
          localStorage.setItem("tv-hidden-regions", JSON.stringify([...hiddenRegions]));
          applyRegionVisibility(); renderMapTimers(); renderSidebar();
        });
        const pip = document.createElement("span");
        pip.className = "tv-region-pip"; pip.style.background = reg.color;
        label.append(cb, pip, document.createTextNode(" " + reg.name));
        container.appendChild(label);
      }
    }

    const clToggle = document.getElementById("tv-const-label-toggle");
    if (clToggle) {
      clToggle.checked = showConstLabels;
      clToggle.addEventListener("change", () => {
        showConstLabels = clToggle.checked;
        localStorage.setItem("tv-const-labels", showConstLabels);
        buildConstellationHulls(document.getElementById("tv-const-hulls"));
      });
    }

    const resetBtn = document.getElementById("tv-reset-all-positions");
    if (resetBtn) resetBtn.addEventListener("click", () => {
      if (confirm("Reset all custom node positions to defaults?")) resetAllPositions();
    });
  }
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function createEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

boot();
