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
let customPositions   = {};   // system_name -> {nx, ny} — overrides from DB
let upcomingWindowMin = CFG.upcomingWindowMin;
let filterObjective   = "";
let hiddenRegions     = new Set(JSON.parse(localStorage.getItem("tv-hidden-regions") || "[]"));
let showConstLabels   = localStorage.getItem("tv-const-labels") !== "false";

// Map pan/zoom
let vb        = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };
let isPanning = false;
let panStart  = null;

// Node dragging (configure_timerviz only)
let dragState = null;  // { sysId, sysName, startSvgX, startSvgY, origNx, origNy, moved }

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  mapData = await fetch(CFG.mapDataUrl).then((r) => r.json());

  // Load any saved custom positions from the server
  if (CFG.positionsUrl) {
    try {
      const pd = await fetch(CFG.positionsUrl).then((r) => r.json());
      customPositions = pd.positions || {};
    } catch (e) {
      console.warn("timerviz: could not load positions", e);
    }
  }

  // Apply custom positions to mapData before building
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

async function resetAllPositions() {
  try {
    await fetch(CFG.positionsResetUrl, {
      method: "POST",
      headers: { "X-CSRFToken": CFG.csrfToken },
      body: JSON.stringify({}),
    });
    customPositions = {};
    // Reload map-data to get default positions
    mapData = await fetch(CFG.mapDataUrl).then((r) => r.json());
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
  const fireMs  = new Date(t.eve_time).getTime();
  const elapsed = now - fireMs;
  if (elapsed < 0) {
    if (-elapsed <= upcomingWindowMin * 60 * 1000) return "upcoming";
    return "future";
  }
  if (elapsed < REPAIR_MS) return "repairing";
  return "elapsed";
}

function countdownText(t, now) {
  if (t.confirmed) return "Confirmed";
  const diff = new Date(t.eve_time).getTime() - now;
  if (diff > 0) return "T-" + fmtDuration(diff);
  const since = -diff;
  if (since < REPAIR_MS) return "Repairing " + fmtDuration(REPAIR_MS - since);
  return "Awaiting confirmation";
}

function shortCountdown(t, now) {
  if (t.confirmed) return "✓";
  const diff = new Date(t.eve_time).getTime() - now;
  if (diff > 0) return "T-" + shortDur(diff);
  const since = -diff;
  if (since < REPAIR_MS) return "Rep " + shortDur(REPAIR_MS - since);
  return "Confirm";
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(sec)}s`;
  if (m > 0) return `${m}m ${pad2(sec)}s`;
  return `${sec}s`;
}

function shortDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${pad2(m)}m`;
  return `${m}m${pad2(s % 60)}s`;
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
  if (!shown.length) {
    list.innerHTML = '<div style="padding:12px;color:#8b949e;font-size:0.8rem;">No active timers</div>';
    return;
  }

  for (const t of shown) {
    const state = timerState(t, now);
    const card  = document.createElement("div");
    card.className       = "tv-timer-card tv-" + state;
    card.dataset.timerId = t.id;

    const sys         = mapData?.systems.find((s) => s.name === t.system);
    const regionColor = sys?.regionColor ?? "#8b949e";

    card.innerHTML = `
      <div class="tv-card-system">
        <span class="tv-region-pip" style="background:${regionColor}" title="${escHtml(sys?.regionName ?? "")}"></span>
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
  if (obj === "Hostile")  return "#da3633";
  if (obj === "Friendly") return "#238636";
  return "#6e7681";
}

// ── Map build ─────────────────────────────────────────────────────────────────

function buildMap() {
  const svg = document.getElementById("tv-map");
  svg.setAttribute("viewBox", `0 0 ${MAP_SIZE} ${MAP_SIZE}`);

  const regionNames = [...new Set(mapData.systems.map((s) => s.regionName))];
  document.getElementById("tv-region-label").textContent = regionNames.join(" · ");

  // Layer: constellation hulls
  const hullG = createEl("g", { id: "tv-const-hulls" });
  svg.appendChild(hullG);

  // Layer: edges
  const edgeG = createEl("g", { id: "tv-edges" });
  for (const e of mapData.edges) {
    const sysA = mapData.systems.find((s) => s.id === e.a);
    const sysB = mapData.systems.find((s) => s.id === e.b);
    if (!sysA || !sysB) continue;
    const interRegion = sysA.regionId !== sysB.regionId;
    edgeG.appendChild(createEl("line", {
      id: `tv-edge-${e.a}-${e.b}`,
      class: interRegion ? "tv-edge tv-edge-inter" : "tv-edge",
      x1: sysA.nx * MAP_SIZE, y1: sysA.ny * MAP_SIZE,
      x2: sysB.nx * MAP_SIZE, y2: sysB.ny * MAP_SIZE,
      "data-sys-a": sysA.id, "data-sys-b": sysB.id,
    }));
  }
  svg.appendChild(edgeG);

  // Layer: nodes
  const nodeG = createEl("g", { id: "tv-nodes" });
  for (const sys of mapData.systems) {
    const cx = sys.nx * MAP_SIZE, cy = sys.ny * MAP_SIZE;
    const g = createEl("g", {
      id: "tv-sys-" + sys.id,
      "data-system": sys.name,
      "data-sys-id": sys.id,
      class: "tv-system-group",
    });

    g.appendChild(createEl("ellipse", {
      class: "tv-system-node",
      cx, cy, rx: NODE_RX, ry: NODE_RY,
      stroke: sys.regionColor,
      "data-base-stroke": sys.regionColor,
    }));

    const lbl = createEl("text", { class: "tv-system-label", x: cx, y: cy });
    lbl.textContent = sys.name;
    g.appendChild(lbl);

    g.appendChild(createEl("g", { id: "tv-badges-" + sys.id, class: "tv-badge-group" }));
    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  buildConstellationHulls(hullG);
  applyRegionVisibility();
  initPanZoom(svg);
  if (CFG.canConfigure) initNodeDrag(svg);
  applyViewBox();
}

// ── Constellation hulls ───────────────────────────────────────────────────────

function convexHull(pts) {
  if (pts.length < 3) return pts;
  pts = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O, A, B) => (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
  const lower = [], upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
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
    const pts    = sids.map((s) => [s.nx * MAP_SIZE, s.ny * MAP_SIZE]);
    let hull     = convexHull(pts);
    if (hull.length < 3) hull = pts;
    const expanded = expandHull(hull, NODE_RX + 20);
    hullG.appendChild(createEl("polygon", {
      class: "tv-const-hull", id: "tv-hull-" + cidStr,
      points: expanded.map((p) => p.join(",")).join(" "),
      "data-region": c.regionName, style: `fill:${c.color}`,
    }));
    if (showConstLabels) {
      const lbl = createEl("text", {
        class: "tv-const-label", x: c.centerNx * MAP_SIZE, y: c.centerNy * MAP_SIZE,
        "data-region": c.regionName, style: `fill:${c.color}`,
      });
      lbl.textContent = c.name;
      hullG.appendChild(lbl);
    }
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
      g.appendChild(createEl("rect", { class: "tv-map-badge-rect", x: bx, y: by, width: badgeW, height: badgeH, rx: 3, ry: 3 }));
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

// ── Node dragging (configure_timerviz) ───────────────────────────────────────

function initNodeDrag(svg) {
  svg.addEventListener("pointerdown", (e) => {
    const nodeGroup = e.target.closest(".tv-system-group");
    if (!nodeGroup || e.target.closest(".tv-map-timer-badge")) return;

    const sysId   = parseInt(nodeGroup.dataset.sysId, 10);
    const sysName = nodeGroup.dataset.system;
    const sys     = mapData.systems.find((s) => s.id === sysId);
    if (!sys) return;

    e.stopPropagation(); // prevent map pan
    const pt = svgPt(svg, e.clientX, e.clientY);
    dragState = { sysId, sysName, startSvgX: pt.x, startSvgY: pt.y, origNx: sys.nx, origNy: sys.ny, moved: false };
    nodeGroup.style.cursor = "grabbing";
    nodeGroup.setPointerCapture(e.pointerId);
    updateDragHint(true);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!dragState) return;
    const pt  = svgPt(svg, e.clientX, e.clientY);
    const dx  = pt.x - dragState.startSvgX;
    const dy  = pt.y - dragState.startSvgY;
    if (Math.hypot(dx, dy) < 3) return;
    dragState.moved = true;

    const sys = mapData.systems.find((s) => s.id === dragState.sysId);
    if (!sys) return;

    sys.nx = Math.max(0.01, Math.min(0.99, dragState.origNx + dx / MAP_SIZE));
    sys.ny = Math.max(0.01, Math.min(0.99, dragState.origNy + dy / MAP_SIZE));

    moveSystemNode(sys);
  });

  svg.addEventListener("pointerup", async (e) => {
    if (!dragState) return;
    const { sysId, sysName, moved } = dragState;
    dragState = null;
    updateDragHint(false);

    const nodeGroup = document.getElementById("tv-sys-" + sysId);
    if (nodeGroup) nodeGroup.style.cursor = "";

    if (!moved) return;

    const sys = mapData.systems.find((s) => s.id === sysId);
    if (!sys) return;
    await savePosition(sysName, sys.nx, sys.ny);

    // Rebuild hulls since positions changed
    buildConstellationHulls(document.getElementById("tv-const-hulls"));
    renderMapTimers();
  });

  svg.addEventListener("pointercancel", () => { dragState = null; updateDragHint(false); });
}

function moveSystemNode(sys) {
  const cx = sys.nx * MAP_SIZE, cy = sys.ny * MAP_SIZE;
  const g  = document.getElementById("tv-sys-" + sys.id);
  if (!g) return;

  const ellipse = g.querySelector(".tv-system-node");
  if (ellipse) { ellipse.setAttribute("cx", cx); ellipse.setAttribute("cy", cy); }

  const lbl = g.querySelector(".tv-system-label");
  if (lbl) { lbl.setAttribute("x", cx); lbl.setAttribute("y", cy); }

  // Move attached edges
  document.querySelectorAll(`line[data-sys-a="${sys.id}"]`).forEach((l) => { l.setAttribute("x1", cx); l.setAttribute("y1", cy); });
  document.querySelectorAll(`line[data-sys-b="${sys.id}"]`).forEach((l) => { l.setAttribute("x2", cx); l.setAttribute("y2", cy); });

  // Move badges
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

function updateDragHint(dragging) {
  const hint = document.getElementById("tv-drag-mode-label");
  if (!hint) return;
  hint.innerHTML = dragging
    ? "Drag mode: <strong style='color:#e3b341'>dragging…</strong>"
    : "Drag mode: <strong>click node to drag</strong>";
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

// ── Pan / Zoom ────────────────────────────────────────────────────────────────

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

function svgPt(svg, cx, cy) {
  const pt = svg.createSVGPoint();
  pt.x = cx; pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function initPanZoom(svg) {
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tv-system-group") || e.target.closest(".tv-map-timer-badge")) return;
    isPanning = true;
    panStart  = svgPt(svg, e.clientX, e.clientY);
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!isPanning || !panStart) return;
    const cur = svgPt(svg, e.clientX, e.clientY);
    vb.x -= cur.x - panStart.x; vb.y -= cur.y - panStart.y;
    applyViewBox();
    panStart = svgPt(svg, e.clientX, e.clientY);
  });
  svg.addEventListener("pointerup",     () => { isPanning = false; panStart = null; });
  svg.addEventListener("pointercancel", () => { isPanning = false; panStart = null; });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const pt = svgPt(svg, e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 0.87, pt.x, pt.y);
  }, { passive: false });
}

// ── Controls ──────────────────────────────────────────────────────────────────

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
    // Region toggles
    const container = document.getElementById("tv-region-toggles");
    if (container && mapData?.regions) {
      for (const reg of mapData.regions) {
        const label = document.createElement("label");
        label.className = "tv-region-toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !hiddenRegions.has(reg.name);
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

    // Constellation label toggle
    const clToggle = document.getElementById("tv-const-label-toggle");
    if (clToggle) {
      clToggle.checked = showConstLabels;
      clToggle.addEventListener("change", () => {
        showConstLabels = clToggle.checked;
        localStorage.setItem("tv-const-labels", showConstLabels);
        buildConstellationHulls(document.getElementById("tv-const-hulls"));
      });
    }

    // Reset positions
    const resetBtn = document.getElementById("tv-reset-all-positions");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        if (confirm("Reset all custom node positions to defaults?")) resetAllPositions();
      });
    }

    // Show drag hint
    updateDragHint(false);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function createEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

boot();
