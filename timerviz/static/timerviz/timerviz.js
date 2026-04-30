/**
 * timerviz.js — Alliance Auth structure timer map visualization
 */

const CFG = window.TIMERVIZ_CONFIG;

// ── Constants ────────────────────────────────────────────────────────────────

const REPAIR_MS = CFG.repairWindowMin * 60 * 1000;
const SVG_NS    = "http://www.w3.org/2000/svg";
const MAP_SIZE  = 1000;
const NODE_RX   = 26;
const NODE_RY   = 14;
const POLL_MS   = 10_000;

// ── State ────────────────────────────────────────────────────────────────────

let timers           = [];
let mapData          = null;
let upcomingWindowMin = CFG.upcomingWindowMin;
let filterObjective  = "";
let hiddenRegions    = new Set(JSON.parse(localStorage.getItem("tv-hidden-regions") || "[]"));
let showConstLabels  = localStorage.getItem("tv-const-labels") !== "false";

// viewBox pan/zoom
let vb        = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };
let isPanning = false;
let panStart  = null;

// ── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  mapData = await fetch(CFG.mapDataUrl).then((r) => r.json());
  buildMap();
  await fetchTimers();
  setInterval(fetchTimers, POLL_MS);
  setInterval(tick, 1000);
  tick();
  initControls();
}

// ── Data ─────────────────────────────────────────────────────────────────────

async function fetchTimers() {
  try {
    const data = await fetch(CFG.timerDataUrl).then((r) => r.json());
    timers           = data.timers;
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
  const fireMs = new Date(t.eve_time).getTime();
  const diff   = fireMs - now;
  if (diff > 0)           return "T-" + fmtDuration(diff);
  const since = -diff;
  if (since < REPAIR_MS)  return "Repairing " + fmtDuration(REPAIR_MS - since);
  return "Awaiting confirmation";
}

function shortCountdown(t, now) {
  if (t.confirmed) return "✓";
  const fireMs = new Date(t.eve_time).getTime();
  const diff   = fireMs - now;
  if (diff > 0)                     return "T-" + shortDur(diff);
  const since = -diff;
  if (since < REPAIR_MS)            return "Rep " + shortDur(REPAIR_MS - since);
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

// ── Tick: live countdown updates ─────────────────────────────────────────────

function tick() {
  const now = Date.now();

  const clockEl = document.getElementById("tv-clock");
  if (clockEl) clockEl.textContent = "EVE " + new Date(now).toISOString().slice(11, 19) + " UTC";

  document.querySelectorAll(".tv-timer-card[data-timer-id]").forEach((card) => {
    const t = timers.find((x) => x.id === parseInt(card.dataset.timerId, 10));
    if (!t) return;
    const state = timerState(t, now);
    card.className = "tv-timer-card tv-" + state;
    const cdEl = card.querySelector(".tv-card-countdown");
    if (cdEl) cdEl.textContent = countdownText(t, now);
  });

  document.querySelectorAll(".tv-map-timer-badge[data-timer-id]").forEach((g) => {
    const t = timers.find((x) => x.id === parseInt(g.dataset.timerId, 10));
    if (!t) return;
    const state = timerState(t, now);
    g.className.baseVal = "tv-map-timer-badge tv-badge-" + state;
    const textEl = g.querySelector(".tv-map-badge-text");
    if (textEl) textEl.textContent = shortCountdown(t, now);
  });
}

// ── Full render ───────────────────────────────────────────────────────────────

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
    card.className  = "tv-timer-card tv-" + state;
    card.dataset.timerId = t.id;

    const sys        = mapData?.systems.find((s) => s.name === t.system);
    const regionColor = sys?.regionColor ?? "#8b949e";
    const objColor   = objectiveColor(t.objective);

    card.innerHTML = `
      <div class="tv-card-system">
        <span class="tv-region-pip" style="background:${regionColor}" title="${escHtml(sys?.regionName ?? "")}"></span>
        ${escHtml(t.system)}
        ${t.objective ? `<span class="tv-obj-badge" style="background:${objColor}">${escHtml(t.objective)}</span>` : ""}
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

  // Region label
  const regionNames = [...new Set(mapData.systems.map((s) => s.regionName))];
  document.getElementById("tv-region-label").textContent = regionNames.join(" · ");

  // Constellation hull layer (drawn first, behind edges)
  const hullG = createEl("g", { id: "tv-const-hulls" });
  svg.appendChild(hullG);

  // Edge layer
  const edgeG = createEl("g", { id: "tv-edges" });
  for (const e of mapData.edges) {
    const sysA = mapData.systems.find((s) => s.id === e.a);
    const sysB = mapData.systems.find((s) => s.id === e.b);
    if (!sysA || !sysB) continue;
    const isInterRegion = sysA.regionId !== sysB.regionId;
    const line = createEl("line", {
      class: isInterRegion ? "tv-edge tv-edge-inter" : "tv-edge",
      x1: sysA.nx * MAP_SIZE, y1: sysA.ny * MAP_SIZE,
      x2: sysB.nx * MAP_SIZE, y2: sysB.ny * MAP_SIZE,
      "data-sys-a": sysA.id,  "data-sys-b": sysB.id,
    });
    edgeG.appendChild(line);
  }
  svg.appendChild(edgeG);

  // Node layer
  const nodeG = createEl("g", { id: "tv-nodes" });
  for (const sys of mapData.systems) {
    const cx = sys.nx * MAP_SIZE;
    const cy = sys.ny * MAP_SIZE;

    const g = createEl("g", {
      id: "tv-sys-" + sys.id,
      "data-system": sys.name,
      class: "tv-system-group",
    });

    const ellipse = createEl("ellipse", {
      class: "tv-system-node",
      cx, cy, rx: NODE_RX, ry: NODE_RY,
      stroke: sys.regionColor,
      "data-base-stroke": sys.regionColor,
    });
    g.appendChild(ellipse);

    const label = createEl("text", {
      class: "tv-system-label",
      x: cx, y: cy,
    });
    label.textContent = sys.name;
    g.appendChild(label);

    const badgeG = createEl("g", { id: "tv-badges-" + sys.id, class: "tv-badge-group" });
    g.appendChild(badgeG);
    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  buildConstellationHulls(hullG);
  applyRegionVisibility();
  initPanZoom(svg);
  applyViewBox();
}

// ── Constellation hull (convex hull background) ───────────────────────────────

function convexHull(points) {
  if (points.length < 3) return points;
  points = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (O, A, B) => (A[0] - O[0]) * (B[1] - O[1]) - (A[1] - O[1]) * (B[0] - O[0]);
  const lower = [], upper = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...points].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return [...lower, ...upper];
}

function expandHull(hull, padding) {
  // Find centroid then push each point outward
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  return hull.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * padding, y + (dy / len) * padding];
  });
}

function buildConstellationHulls(hullG) {
  hullG.innerHTML = "";
  const consts = mapData.constellations;
  if (!consts) return;

  for (const [cidStr, c] of Object.entries(consts)) {
    const sids = mapData.systems
      .filter((s) => s.constellationId === parseInt(cidStr, 10));
    if (sids.length < 2) continue;

    const points = sids.map((s) => [s.nx * MAP_SIZE, s.ny * MAP_SIZE]);
    let hull = convexHull(points);
    if (hull.length < 3) hull = points;  // fallback for collinear
    const expanded = expandHull(hull, NODE_RX + 8);

    const poly = createEl("polygon", {
      class: "tv-const-hull",
      id: "tv-hull-" + cidStr,
      points: expanded.map((p) => p.join(",")).join(" "),
      "data-region": c.regionName,
      style: `fill:${c.color}`,
    });
    hullG.appendChild(poly);

    if (showConstLabels) {
      const lx = c.centerNx * MAP_SIZE;
      const ly = c.centerNy * MAP_SIZE;
      const lbl = createEl("text", {
        class: "tv-const-label",
        x: lx, y: ly,
        "data-region": c.regionName,
        style: `fill:${c.color}`,
      });
      lbl.textContent = c.name;
      hullG.appendChild(lbl);
    }
  }
}

// ── Map timer rendering ───────────────────────────────────────────────────────

function renderMapTimers() {
  const now = Date.now();

  // Group visible timers by system
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

    if (nodeEl) {
      nodeEl.setAttribute("stroke", stateStroke(dominant));
      nodeEl.className.baseVal = "tv-system-node tv-has-timer tv-node-" + dominant;
    }
    if (labelEl) labelEl.className.baseVal = "tv-system-label tv-has-timer";

    const cx      = sys.nx * MAP_SIZE;
    const baseCy  = sys.ny * MAP_SIZE + NODE_RY + 6;
    const badgeW  = 54, badgeH = 14, gap = 2;

    entries.forEach(({ t, state }, i) => {
      const bx = cx - badgeW / 2;
      const by = baseCy + i * (badgeH + gap);

      const g = createEl("g", {
        class: "tv-map-timer-badge tv-badge-" + state,
        "data-timer-id": t.id,
      });
      const rect = createEl("rect", { class: "tv-map-badge-rect", x: bx, y: by, width: badgeW, height: badgeH, rx: 3, ry: 3 });
      g.appendChild(rect);
      const text = createEl("text", { class: "tv-map-badge-text", x: bx + badgeW / 2, y: by + badgeH / 2 });
      text.textContent = shortCountdown(t, now);
      g.appendChild(text);

      if (state === "elapsed" && CFG.canConfirm) {
        g.style.cursor = "pointer";
        g.addEventListener("click", () => confirmRepair(t.id));
      }
      badgeG.appendChild(g);
    });
  }
}

function stateStroke(state) {
  return { upcoming: "#1f6feb", repairing: "#da3633", elapsed: "#e3b341", confirmed: "#238636" }[state] ?? "#30363d";
}

// ── Region / constellation visibility ────────────────────────────────────────

function applyRegionVisibility() {
  for (const sys of mapData.systems) {
    const hidden = hiddenRegions.has(sys.regionName);
    const g = document.getElementById("tv-sys-" + sys.id);
    if (g) g.style.display = hidden ? "none" : "";
  }

  // Hide edges where both endpoints are in hidden regions
  document.querySelectorAll(".tv-edge[data-sys-a]").forEach((line) => {
    const sysA = mapData.systems.find((s) => s.id === parseInt(line.dataset.sysA, 10));
    const sysB = mapData.systems.find((s) => s.id === parseInt(line.dataset.sysB, 10));
    const hide = (sysA && hiddenRegions.has(sysA.regionName)) && (sysB && hiddenRegions.has(sysB.regionName));
    line.style.display = hide ? "none" : "";
  });

  // Hide constellation hulls for hidden regions
  document.querySelectorAll(".tv-const-hull, .tv-const-label").forEach((el) => {
    const hidden = hiddenRegions.has(el.dataset.region);
    el.style.display = hidden ? "none" : "";
  });
}

// ── Pan / Zoom ────────────────────────────────────────────────────────────────

function applyViewBox() {
  document.getElementById("tv-map").setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function zoom(factor, cx, cy) {
  const newW = Math.min(4800, Math.max(150, vb.w * factor));
  const pX   = cx ?? vb.x + vb.w / 2;
  const pY   = cy ?? vb.y + vb.h / 2;
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
    if (e.target.closest(".tv-map-timer-badge")) return;
    isPanning = true;
    panStart  = svgPt(svg, e.clientX, e.clientY);
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!isPanning || !panStart) return;
    const cur = svgPt(svg, e.clientX, e.clientY);
    vb.x -= cur.x - panStart.x;
    vb.y -= cur.y - panStart.y;
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

  // Region toggles (configure_timerviz only)
  if (CFG.canConfigure) {
    const container = document.getElementById("tv-region-toggles");
    if (container && mapData?.regions) {
      for (const reg of mapData.regions) {
        const label = document.createElement("label");
        label.className = "tv-region-toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !hiddenRegions.has(reg.name);
        cb.addEventListener("change", () => {
          if (cb.checked) hiddenRegions.delete(reg.name);
          else hiddenRegions.add(reg.name);
          localStorage.setItem("tv-hidden-regions", JSON.stringify([...hiddenRegions]));
          applyRegionVisibility();
          renderMapTimers();
          renderSidebar();
        });
        const pip = document.createElement("span");
        pip.className = "tv-region-pip";
        pip.style.background = reg.color;
        label.appendChild(cb);
        label.appendChild(pip);
        label.appendChild(document.createTextNode(" " + reg.name));
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

// ── Start ─────────────────────────────────────────────────────────────────────

boot();
