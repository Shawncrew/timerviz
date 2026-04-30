/**
 * timerviz.js — Alliance Auth structure timer map visualization
 */

const CFG = window.TIMERVIZ_CONFIG;

// ── Constants ────────────────────────────────────────────────────────────────

const REPAIR_MS = CFG.repairWindowMin * 60 * 1000;
const SVG_NS = "http://www.w3.org/2000/svg";
const MAP_SIZE = 1000;
const NODE_RX = 26;
const NODE_RY = 14;
const MAP_SPREAD = 1.1;
const POLL_MS = 10_000;

// ── State ────────────────────────────────────────────────────────────────────

let timers = [];
let mapData = null;
let upcomingWindowMin = CFG.upcomingWindowMin;
let filterObjective = "";

// viewBox for pan/zoom
let vb = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };
let isPanning = false;
let panStart = null;

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
    timers = data.timers;
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
    await fetch(url, {
      method: "POST",
      headers: { "X-CSRFToken": CFG.csrfToken },
    });
    await fetchTimers();
  } catch (e) {
    console.error("timerviz: confirm repair failed", e);
  }
}

// ── Timer state helpers ───────────────────────────────────────────────────────

function timerState(t, now) {
  if (t.confirmed) return "confirmed";
  const fireMs = new Date(t.eve_time).getTime();
  const elapsed = now - fireMs;
  if (elapsed < 0) {
    // future timer — only "upcoming" if within window
    const windowMs = upcomingWindowMin * 60 * 1000;
    if (-elapsed <= windowMs) return "upcoming";
    return "future"; // beyond window, not shown on map
  }
  if (elapsed < REPAIR_MS) return "repairing";
  return "elapsed";
}

function countdownText(t, now) {
  const fireMs = new Date(t.eve_time).getTime();
  const diff = fireMs - now;
  if (t.confirmed) return "Confirmed";
  if (diff > 0) {
    return "T-" + formatDuration(diff);
  }
  const since = -diff;
  if (since < REPAIR_MS) {
    return "Repairing " + formatDuration(REPAIR_MS - since);
  }
  return "Awaiting confirmation";
}

function formatDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

// ── Tick: update countdowns without full re-render ────────────────────────────

function tick() {
  const now = Date.now();

  // Update clock
  const clockEl = document.getElementById("tv-clock");
  if (clockEl) {
    clockEl.textContent = "EVE " + new Date(now).toISOString().slice(11, 19) + " UTC";
  }

  // Update sidebar countdowns
  document.querySelectorAll(".tv-timer-card[data-timer-id]").forEach((card) => {
    const id = parseInt(card.dataset.timerId, 10);
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    const state = timerState(t, now);
    const cdEl = card.querySelector(".tv-card-countdown");
    if (cdEl) cdEl.textContent = countdownText(t, now);
    // refresh state classes
    card.className = "tv-timer-card " + stateClass(state);
  });

  // Update map badge countdowns
  document.querySelectorAll(".tv-map-timer-badge[data-timer-id]").forEach((g) => {
    const id = parseInt(g.dataset.timerId, 10);
    const t = timers.find((x) => x.id === id);
    if (!t) return;
    const state = timerState(t, now);
    const textEl = g.querySelector(".tv-map-badge-text");
    if (textEl) textEl.textContent = shortCountdown(t, now);
    g.className.baseVal = "tv-map-timer-badge tv-badge-" + state;
  });
}

function shortCountdown(t, now) {
  const fireMs = new Date(t.eve_time).getTime();
  const diff = fireMs - now;
  if (t.confirmed) return "✓";
  if (diff > 0) return "T-" + shortDuration(diff);
  const since = -diff;
  if (since < REPAIR_MS) return "Rep " + shortDuration(REPAIR_MS - since);
  return "Confirm";
}

function shortDuration(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(total % 60).padStart(2, "0")}s`;
}

function stateClass(state) {
  return "tv-" + state;
}

// ── Full render ───────────────────────────────────────────────────────────────

function render() {
  renderSidebar();
  renderMapTimers();
}

function visibleTimers() {
  const now = Date.now();
  return timers.filter((t) => {
    if (filterObjective && t.objective !== filterObjective) return false;
    const state = timerState(t, now);
    return state !== "future"; // hide timers beyond upcoming window
  });
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function renderSidebar() {
  const now = Date.now();
  const list = document.getElementById("tv-timer-list");
  const shown = visibleTimers().sort(
    (a, b) => new Date(a.eve_time) - new Date(b.eve_time)
  );

  list.innerHTML = "";

  if (shown.length === 0) {
    list.innerHTML = '<div style="padding:12px;color:#8b949e;font-size:0.8rem;">No active timers</div>';
    return;
  }

  for (const t of shown) {
    const state = timerState(t, now);
    const card = document.createElement("div");
    card.className = "tv-timer-card " + stateClass(state);
    card.dataset.timerId = t.id;

    const objective = t.objective || "";
    const objBadge = objective
      ? `<span style="font-size:0.68rem;padding:1px 5px;border-radius:3px;background:${objectiveColor(objective)};color:#fff;margin-left:4px;">${objective}</span>`
      : "";

    card.innerHTML = `
      <div class="tv-card-system">${escHtml(t.system)}${objBadge}</div>
      <div class="tv-card-meta">${escHtml(t.structure)}${t.timer_type ? " · " + escHtml(t.timer_type) : ""}${t.planet_moon ? " · " + escHtml(t.planet_moon) : ""}</div>
      ${t.details ? `<div class="tv-card-meta">${escHtml(t.details)}</div>` : ""}
      <div class="tv-card-countdown">${countdownText(t, now)}</div>
      ${state === "elapsed" && CFG.canConfirm ? `<div class="tv-card-confirm-hint">↑ Click to confirm repaired</div>` : ""}
    `;

    if (state === "elapsed" && CFG.canConfirm) {
      card.addEventListener("click", () => confirmRepair(t.id));
    }

    list.appendChild(card);
  }
}

function objectiveColor(obj) {
  if (obj === "Hostile") return "#da3633";
  if (obj === "Friendly") return "#238636";
  return "#6e7681";
}

// ── Map ───────────────────────────────────────────────────────────────────────

function buildMap() {
  const svg = document.getElementById("tv-map");
  svg.setAttribute("viewBox", `0 0 ${MAP_SIZE} ${MAP_SIZE}`);

  const regionNames = [...new Set(mapData.systems.map((s) => s.regionName))];
  document.getElementById("tv-region-label").textContent = regionNames.join(" · ");

  // Edges layer
  const edgeG = createSvgEl("g", { id: "tv-edges" });
  for (const e of mapData.edges) {
    const sysA = mapData.systems.find((s) => s.id === e.a);
    const sysB = mapData.systems.find((s) => s.id === e.b);
    if (!sysA || !sysB) continue;
    const [ax, ay] = spread(sysA.nx, sysA.ny);
    const [bx, by] = spread(sysB.nx, sysB.ny);
    const line = createSvgEl("line", {
      class: "tv-edge",
      x1: ax * MAP_SIZE,
      y1: ay * MAP_SIZE,
      x2: bx * MAP_SIZE,
      y2: by * MAP_SIZE,
    });
    edgeG.appendChild(line);
  }
  svg.appendChild(edgeG);

  // Nodes layer
  const nodeG = createSvgEl("g", { id: "tv-nodes" });
  for (const sys of mapData.systems) {
    const [nx, ny] = spread(sys.nx, sys.ny);
    const cx = nx * MAP_SIZE;
    const cy = ny * MAP_SIZE;

    const g = createSvgEl("g", {
      id: "tv-sys-" + sys.id,
      "data-system": sys.name,
      class: "tv-system-group",
    });

    const ellipse = createSvgEl("ellipse", {
      class: "tv-system-node",
      cx,
      cy,
      rx: NODE_RX,
      ry: NODE_RY,
      stroke: "#30363d",
    });
    g.appendChild(ellipse);

    const label = createSvgEl("text", {
      class: "tv-system-label",
      x: cx,
      y: cy,
    });
    label.textContent = sys.name;
    g.appendChild(label);

    // Placeholder for timer badges; filled in renderMapTimers
    const badgeG = createSvgEl("g", {
      id: "tv-badges-" + sys.id,
      class: "tv-badge-group",
    });
    g.appendChild(badgeG);

    nodeG.appendChild(g);
  }
  svg.appendChild(nodeG);

  initPanZoom(svg);
  applyViewBox();
}

function renderMapTimers() {
  const now = Date.now();

  // Group visible timers by system name
  const bySystem = {};
  for (const t of visibleTimers()) {
    const state = timerState(t, now);
    if (state === "confirmed") continue; // hide confirmed from map
    if (!bySystem[t.system]) bySystem[t.system] = [];
    bySystem[t.system].push({ t, state });
  }

  // Clear and rebuild all badge groups + node outlines
  for (const sys of mapData.systems) {
    const nodeEl = document.querySelector(`#tv-sys-${sys.id} .tv-system-node`);
    const labelEl = document.querySelector(`#tv-sys-${sys.id} .tv-system-label`);
    const badgeG = document.getElementById("tv-badges-" + sys.id);
    if (!badgeG) continue;

    badgeG.innerHTML = "";
    const entries = bySystem[sys.name] || [];

    if (entries.length === 0) {
      if (nodeEl) { nodeEl.setAttribute("stroke", "#30363d"); nodeEl.className.baseVal = "tv-system-node"; }
      if (labelEl) labelEl.className.baseVal = "tv-system-label";
      continue;
    }

    // Determine dominant state for node outline (worst-case priority)
    const priority = ["repairing", "elapsed", "upcoming"];
    const dominant = priority.find((p) => entries.some((e) => e.state === p)) || entries[0].state;

    if (nodeEl) {
      nodeEl.setAttribute("stroke", stateStroke(dominant));
      nodeEl.className.baseVal = "tv-system-node tv-has-timer tv-node-" + dominant;
    }
    if (labelEl) labelEl.className.baseVal = "tv-system-label tv-has-timer";

    // Build badge row below node
    const [nx, ny] = spread(sys.nx, sys.ny);
    const cx = nx * MAP_SIZE;
    const baseCy = ny * MAP_SIZE + NODE_RY + 6;
    const badgeW = 54;
    const badgeH = 14;
    const gap = 2;
    const totalW = entries.length * (badgeW + gap) - gap;
    const startX = cx - totalW / 2;

    entries.forEach(({ t, state }, i) => {
      const bx = startX + i * (badgeW + gap);
      const by = baseCy + i * (badgeH + 2);

      const g = createSvgEl("g", {
        class: "tv-map-timer-badge tv-badge-" + state,
        "data-timer-id": t.id,
      });

      const rect = createSvgEl("rect", {
        class: "tv-map-badge-rect",
        x: bx,
        y: by,
        width: badgeW,
        height: badgeH,
        rx: 3,
        ry: 3,
      });
      g.appendChild(rect);

      const text = createSvgEl("text", {
        class: "tv-map-badge-text",
        x: bx + badgeW / 2,
        y: by + badgeH / 2,
      });
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
  const colors = {
    upcoming: "#1f6feb",
    repairing: "#da3633",
    elapsed: "#e3b341",
    confirmed: "#238636",
  };
  return colors[state] || "#30363d";
}

// ── Pan / Zoom ────────────────────────────────────────────────────────────────

function spread(nx, ny) {
  const x = 0.5 + (nx - 0.5) * MAP_SPREAD;
  const y = 0.5 + (ny - 0.5) * MAP_SPREAD;
  return [Math.min(0.99, Math.max(0.01, x)), Math.min(0.99, Math.max(0.01, y))];
}

function applyViewBox() {
  const svg = document.getElementById("tv-map");
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function zoom(factor, cx, cy) {
  // cx, cy in SVG coords
  const newW = Math.min(4800, Math.max(150, vb.w * factor));
  const newH = Math.min(4800, Math.max(150, vb.h * factor));
  const scaleW = newW / vb.w;
  const scaleH = newH / vb.h;
  const pivotX = cx !== undefined ? cx : vb.x + vb.w / 2;
  const pivotY = cy !== undefined ? cy : vb.y + vb.h / 2;
  vb.x = pivotX - (pivotX - vb.x) * scaleW;
  vb.y = pivotY - (pivotY - vb.y) * scaleH;
  vb.w = newW;
  vb.h = newH;
  applyViewBox();
}

function svgPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

function initPanZoom(svg) {
  svg.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".tv-map-timer-badge")) return;
    isPanning = true;
    panStart = svgPoint(svg, e.clientX, e.clientY);
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener("pointermove", (e) => {
    if (!isPanning || !panStart) return;
    const cur = svgPoint(svg, e.clientX, e.clientY);
    vb.x -= cur.x - panStart.x;
    vb.y -= cur.y - panStart.y;
    applyViewBox();
    // recalc panStart after vb change
    panStart = svgPoint(svg, e.clientX, e.clientY);
  });

  svg.addEventListener("pointerup", () => { isPanning = false; panStart = null; });
  svg.addEventListener("pointercancel", () => { isPanning = false; panStart = null; });

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.15 : 0.87;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    zoom(factor, pt.x, pt.y);
  }, { passive: false });
}

// ── Controls ──────────────────────────────────────────────────────────────────

function initControls() {
  document.getElementById("tv-zoom-in").addEventListener("click", () => zoom(0.75));
  document.getElementById("tv-zoom-out").addEventListener("click", () => zoom(1.35));
  document.getElementById("tv-zoom-reset").addEventListener("click", () => {
    vb = { x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE };
    applyViewBox();
  });

  document.getElementById("tv-filter-objective").addEventListener("change", (e) => {
    filterObjective = e.target.value;
    render();
  });

  document.getElementById("tv-upcoming-window").addEventListener("change", (e) => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v) && v >= 1) {
      upcomingWindowMin = v;
      render();
    }
  });
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function createSvgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Start ─────────────────────────────────────────────────────────────────────

boot();
