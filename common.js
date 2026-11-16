const SVG_NS = "http://www.w3.org/2000/svg";

function formatINR(value) {
  return "₹" + Math.round(value).toLocaleString("en-IN");
}

/**
 * Short axis labels: ₹50K, ₹4.5L, ₹1.25Cr
 */
function formatCompact(value) {
  const trim = (n) => String(parseFloat(n.toFixed(2)));
  if (value >= 1e7) return "₹" + trim(value / 1e7) + "Cr";
  if (value >= 1e5) return "₹" + trim(value / 1e5) + "L";
  if (value >= 1e3) return "₹" + trim(value / 1e3) + "K";
  return "₹" + Math.round(value);
}

/**
 * Readable size in words: "₹33.74 lakh", "₹1.25 crore"
 */
function formatWords(value) {
  const trim = (n) => String(parseFloat(n.toFixed(2)));
  if (value >= 1e7) return "₹" + trim(value / 1e7) + " crore";
  if (value >= 1e5) return "₹" + trim(value / 1e5) + " lakh";
  if (value >= 1e3) return "₹" + trim(value / 1e3) + " thousand";
  return "";
}

/**
 * Step-up SIP, simulated month by month.
 * - `lumpSum` is invested once at the very start.
 * - The monthly payment `P` rises by `stepUp` (e.g. 0.1 = 10%) at the start of every year.
 * - Each payment is made at the start of the month, then grows at monthly rate `i`.
 * - `inflation` (e.g. 0.06 = 6%) discounts each year's value back to today's money.
 * Returns one point per year, starting at year 0.
 */
function simulateSIP(P, lumpSum, i, stepUp, inflation, years) {
  const points = [
    { payment: 0, invested: lumpSum, value: lumpSum, real: lumpSum },
  ];
  let invested = lumpSum;
  let value = lumpSum;
  let payment = P;

  for (let yr = 1; yr <= years; yr++) {
    for (let month = 0; month < 12; month++) {
      invested += payment;
      value = (value + payment) * (1 + i);
    }
    points.push({
      payment,
      invested,
      value,
      real: value / Math.pow(1 + inflation, yr),
    });
    payment *= 1 + stepUp;
  }
  return points;
}

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Round an axis maximum up to 1, 2, 2.5 or 5 × a power of ten
 */
function niceMax(value) {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}

/**
 * Read an optional number box; empty means `fallback`
 */
function readOptional(id, fallback) {
  const raw = document.getElementById(id).value;
  return raw === "" ? fallback : parseFloat(raw);
}

function showTooltip(html, x, y) {
  const tooltip = document.getElementById("tooltip");
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  const pad = 12;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  let left = x + 16;
  let top = y - h - 12;
  if (left + w > window.innerWidth - pad) left = x - w - 16;
  if (top < pad) top = y + 16;
  tooltip.style.left = Math.max(pad, left) + "px";
  tooltip.style.top = top + "px";
}

function hideTooltip() {
  document.getElementById("tooltip").classList.remove("show");
}

/**
 * `swatch` is a class like "value" or "plan-a"; `style` is optional inline CSS for the row
 */
function tooltipRow(swatch, label, value, style = "") {
  return `<div class="tt-row" style="${style}"><i class="swatch ${swatch}"></i>${label}<b>${value}</b></div>`;
}

/**
 * Info icons: show their explanation on hover, keyboard focus or tap
 */
function wireInfoIcons() {
  document.querySelectorAll(".info").forEach((btn) => {
    const show = () => {
      const r = btn.getBoundingClientRect();
      const text = document.createElement("div");
      text.className = "tt-text";
      text.textContent = btn.dataset.info;
      showTooltip(text.outerHTML, r.right - 8, r.top);
    };
    btn.addEventListener("mouseenter", show);
    btn.addEventListener("focus", show);
    btn.addEventListener("click", show);
    btn.addEventListener("mouseleave", hideTooltip);
    btn.addEventListener("blur", hideTooltip);
  });

  // Hide an info tooltip when tapping anywhere else (touch screens)
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".info")) hideTooltip();
  });
}

const NUMBER_ANIM_MS = 450;
const CHART_ANIM_MS = 400;
const REVEAL_MS = 900; // line charts drawing in on first load
const PANEL_MS = 280; // table opening / closing

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Stretch or squeeze a list of yearly values to `len` points (used when the time period changes)
 */
function resample(values, len) {
  if (values.length === len) return values;
  const out = [];
  for (let i = 0; i < len; i++) {
    const pos = (i * (values.length - 1)) / (len - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(values.length - 1, lo + 1);
    out.push(values[lo] + (values[hi] - values[lo]) * (pos - lo));
  }
  return out;
}

/**
 * Count an element's number smoothly from what it shows now to `target`, displayed with `format`
 */
function animateNumber(node, target, format) {
  cancelAnimationFrame(node._anim);
  const from = node._shown;
  if (
    typeof from !== "number" ||
    reduceMotion() ||
    Math.abs(from - target) < 0.5
  ) {
    node._shown = target;
    node.textContent = format(target);
    return;
  }
  let start = null; // timed from the first frame, so progress never runs backwards
  const step = (now) => {
    if (start === null) start = now;
    const t = easeOutCubic(Math.min(1, (now - start) / NUMBER_ANIM_MS));
    node._shown = from + (target - from) * t;
    node.textContent = format(node._shown);
    if (t < 1) node._anim = requestAnimationFrame(step);
  };
  node._anim = requestAnimationFrame(step);
}

/**
 * Show plain text (e.g. "-") and stop any running count
 */
function setStaticText(node, text) {
  cancelAnimationFrame(node._anim);
  node._shown = null;
  node.textContent = text;
}

/**
 * Draws a line chart into `container`.
 *   years:   number of years (x axis runs 0..years)
 *   series:  [{ values: [...one per year], color, dash?, area? }] — drawn in this order, last on top
 *            `dash` is an SVG dash pattern, e.g. "5 4" (dashed) or "2 4" (dotted)
 *   tooltip: (year) => HTML for the hover tooltip
 *   yMax:    optional top of the y axis, to give several charts the same scale
 */
function drawLineChart(
  container,
  { years, series, tooltip, ariaLabel, yMax: fixedMax },
) {
  container.innerHTML = "";
  if (!series) return;

  const width = container.clientWidth;
  const height = 240;
  const m = { top: 8, right: 8, bottom: 26, left: 52 };
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const yMax =
    fixedMax ?? niceMax(Math.max(...series.flatMap((s) => s.values)));
  const x = (yr) => m.left + (yr / years) * w;
  const y = (v) => m.top + h - (v / yMax) * h;

  // viewBox lets the chart scale (e.g. when printing) without being redrawn
  const svg = el(
    "svg",
    {
      viewBox: `0 0 ${width} ${height}`,
      width: "100%",
      role: "img",
      "aria-label": ariaLabel,
    },
    container,
  );

  // Gridlines + y labels
  const yTicks = 4;
  for (let t = 0; t <= yTicks; t++) {
    const v = (yMax / yTicks) * t;
    el(
      "line",
      {
        x1: m.left,
        x2: m.left + w,
        y1: y(v),
        y2: y(v),
        stroke: cssVar("--grid"),
        "stroke-width": 1,
      },
      svg,
    );
    const label = el(
      "text",
      { x: m.left - 8, y: y(v) + 4, "text-anchor": "end" },
      svg,
    );
    label.textContent = formatCompact(v);
  }

  // X labels: about 8 at most
  const rawStep = Math.ceil(years / 8);
  const xStep = [1, 2, 5, 10].find((s) => s >= rawStep) || 10;
  for (let yr = 0; yr <= years; yr += xStep) {
    const label = el(
      "text",
      { x: x(yr), y: height - 6, "text-anchor": "middle" },
      svg,
    );
    label.textContent = yr === 0 ? "0" : yr + "y";
  }

  // Path through `values`, drawn against an axis whose top is `top` (changes during animation)
  const path = (values, top) =>
    values
      .map(
        (v, idx) =>
          (idx ? "L" : "M") +
          x(idx).toFixed(1) +
          " " +
          (m.top + h - (v / top) * h).toFixed(1),
      )
      .join(" ");

  // Soft area under any series that asks for it
  const defs = el("defs", {}, svg);
  const areas = series.map((s, idx) => {
    if (!s.area) return null;
    const id = `${container.id}-area-${idx}`;
    const grad = el("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el(
      "stop",
      { offset: "0%", "stop-color": s.color, "stop-opacity": 0.16 },
      grad,
    );
    el(
      "stop",
      { offset: "100%", "stop-color": s.color, "stop-opacity": 0 },
      grad,
    );
    return el("path", { fill: `url(#${id})` }, svg);
  });

  const lines = series.map((s) =>
    el(
      "path",
      {
        fill: "none",
        stroke: s.color,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
        ...(s.dash ? { "stroke-dasharray": s.dash } : {}),
      },
      svg,
    ),
  );

  const render = (valueSets, top) => {
    valueSets.forEach((values, idx) => {
      const d = path(values, top);
      lines[idx].setAttribute("d", d);
      if (areas[idx])
        areas[idx].setAttribute(
          "d",
          d + ` L${x(years)} ${y(0)} L${x(0)} ${y(0)} Z`,
        );
    });
  };

  // Ease the lines from the previous drawing to the new values
  const target = series.map((s) => s.values);
  const prev = container._prev;
  container._prev = { values: target, yMax };
  cancelAnimationFrame(container._anim);

  const canAnimate =
    prev && prev.values.length === target.length && !reduceMotion();
  const from = canAnimate
    ? prev.values.map((v) => resample(v, years + 1))
    : null;
  const changed =
    from &&
    (prev.yMax !== yMax ||
      from.some((vals, i) =>
        vals.some((v, j) => Math.abs(v - target[i][j]) > 0.5),
      ));

  if (!changed) {
    render(target, yMax);

    // First time this chart appears: draw the lines in from left to right
    if (!prev && !container._revealed && !reduceMotion()) {
      container._revealed = true;
      const clipId = `${container.id}-reveal`;
      const clip = el(
        "rect",
        { x: 0, y: 0, width: 0, height },
        el("clipPath", { id: clipId }, defs),
      );
      [...lines, ...areas.filter(Boolean)].forEach((p) =>
        p.setAttribute("clip-path", `url(#${clipId})`),
      );
      let start = null;
      const step = (now) => {
        if (start === null) start = now;
        const t = easeInOutCubic(Math.min(1, (now - start) / REVEAL_MS));
        clip.setAttribute("width", width * t);
        if (t < 1) container._anim = requestAnimationFrame(step);
      };
      container._anim = requestAnimationFrame(step);
    }
  } else {
    let start = null; // timed from the first frame, so progress never runs backwards
    const step = (now) => {
      if (start === null) start = now;
      const t = easeOutCubic(Math.min(1, (now - start) / CHART_ANIM_MS));
      render(
        target.map((vals, i) =>
          vals.map((v, j) => from[i][j] + (v - from[i][j]) * t),
        ),
        prev.yMax + (yMax - prev.yMax) * t,
      );
      if (t < 1) container._anim = requestAnimationFrame(step);
    };
    render(from, prev.yMax);
    container._anim = requestAnimationFrame(step);
  }

  // Hover layer: crosshair + one dot per series + tooltip
  const hover = el("g", { visibility: "hidden" }, svg);
  const cross = el(
    "line",
    {
      y1: m.top,
      y2: m.top + h,
      stroke: cssVar("--muted"),
      "stroke-width": 1,
      "stroke-dasharray": "3 3",
    },
    hover,
  );
  const dots = series.map((s) =>
    s.dash
      ? el(
          "circle",
          {
            r: 4,
            fill: cssVar("--surface"),
            stroke: s.color,
            "stroke-width": 2,
          },
          hover,
        )
      : el(
          "circle",
          {
            r: 4.5,
            fill: s.color,
            stroke: cssVar("--surface"),
            "stroke-width": 2,
          },
          hover,
        ),
  );

  const overlay = el(
    "rect",
    { x: m.left, y: m.top, width: w, height: h, fill: "transparent" },
    svg,
  );

  // The crosshair and dots glide towards the hovered year instead of snapping
  let shown = null; // position on screen: { x, ys: [one y per series] }
  let goal = null; // position of the hovered year
  let glideFrame = null;

  const place = (pos) => {
    cross.setAttribute("x1", pos.x);
    cross.setAttribute("x2", pos.x);
    dots.forEach((dot, idx) => {
      dot.setAttribute("cx", pos.x);
      dot.setAttribute("cy", pos.ys[idx]);
    });
  };

  const glide = () => {
    const k = 0.3; // fraction of the remaining distance covered each frame
    shown.x += (goal.x - shown.x) * k;
    shown.ys = shown.ys.map((v, idx) => v + (goal.ys[idx] - v) * k);
    const arrived =
      Math.abs(goal.x - shown.x) < 0.3 &&
      shown.ys.every((v, idx) => Math.abs(goal.ys[idx] - v) < 0.3);
    if (arrived) shown = { x: goal.x, ys: [...goal.ys] };
    place(shown);
    glideFrame = arrived ? null : requestAnimationFrame(glide);
  };

  overlay.addEventListener("pointermove", (e) => {
    const box = svg.getBoundingClientRect();
    const px = (e.clientX - box.left) * (width / box.width);
    const yr = Math.max(
      0,
      Math.min(years, Math.round(((px - m.left) / w) * years)),
    );

    goal = { x: x(yr), ys: series.map((s) => y(s.values[yr])) };
    hover.setAttribute("visibility", "visible");
    if (!shown || reduceMotion()) {
      shown = { x: goal.x, ys: [...goal.ys] }; // first appearance: jump straight there
      place(shown);
    } else if (!glideFrame) {
      glideFrame = requestAnimationFrame(glide);
    }
    showTooltip(tooltip(yr), e.clientX, e.clientY);
  });

  overlay.addEventListener("pointerleave", () => {
    cancelAnimationFrame(glideFrame);
    glideFrame = null;
    shown = null;
    hover.setAttribute("visibility", "hidden");
    hideTooltip();
  });
}

/**
 * Call `redraw` when `node` changes width (not on the initial observation,
 * which would otherwise restart the first-load animations)
 */
function onWidthChange(node, redraw) {
  let lastWidth = node.clientWidth;
  new ResizeObserver(() => {
    if (node.clientWidth === lastWidth) return;
    lastWidth = node.clientWidth;
    redraw();
  }).observe(node);
}

/**
 * Smoothly open and close a <details> element. Its content must be wrapped in `.details-body`.
 */
function animateDetails(details) {
  const body = details.querySelector(".details-body");
  details.querySelector("summary").addEventListener("click", (e) => {
    if (reduceMotion() || !body.animate) return; // fall back to the instant toggle
    e.preventDefault();
    if (details._anim) return; // ignore clicks while it's moving

    const easing = "cubic-bezier(0.2, 0.7, 0.3, 1)";
    if (!details.open) {
      details.open = true;
      const h = body.scrollHeight;
      details._anim = body.animate(
        [
          { height: "0px", opacity: 0 },
          { height: h + "px", opacity: 1 },
        ],
        { duration: PANEL_MS, easing },
      );
      details._anim.onfinish = () => (details._anim = null);
    } else {
      const h = body.offsetHeight;
      details._anim = body.animate(
        [
          { height: h + "px", opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: PANEL_MS * 0.85, easing: "ease-in" },
      );
      details._anim.onfinish = () => {
        details.open = false;
        details._anim = null;
      };
    }
  });
}

/**
 * Paint the filled part of a slider in the accent colour
 */
function updateFill(range) {
  const min = parseFloat(range.min);
  const max = parseFloat(range.max);
  const pct = ((parseFloat(range.value) - min) / (max - min)) * 100;
  range.style.setProperty("--fill", pct + "%");
}

/**
 * Keep each number box (#id) and its slider (#id-range) in sync, calling onChange on every edit
 */
function wireSliders(ids, onChange) {
  ids.forEach((id) => {
    const number = document.getElementById(id);
    const range = document.getElementById(id + "-range");
    if (!range) {
      number.addEventListener("input", onChange);
      return;
    }

    range.addEventListener("input", () => {
      number.value = range.value;
      updateFill(range);
      onChange();
    });

    number.addEventListener("input", () => {
      if (number.value !== "") range.value = number.value; // slider clamps to its own min/max
      updateFill(range);
      onChange();
    });

    updateFill(range);
  });
}

/**
 * Put every box and slider back to the value written in the HTML
 */
function resetFields(ids) {
  ids.forEach((id) => {
    const number = document.getElementById(id);
    number.value = number.defaultValue;
    const range = document.getElementById(id + "-range");
    if (range) {
      range.value = range.defaultValue;
      updateFill(range);
    }
  });
}

function saveToURL(ids) {
  const params = new URLSearchParams();
  ids.forEach((id) => params.set(id, document.getElementById(id).value));
  try {
    history.replaceState(null, "", "?" + params.toString());
  } catch {
    // Some browsers block this for local files; the page still works
  }
}

/**
 * Run before wireSliders so the sliders pick up the loaded values
 */
function loadFromURL(ids) {
  const params = new URLSearchParams(location.search);
  ids.forEach((id) => {
    const value = params.get(id);
    if (value !== null && value !== "" && !isNaN(parseFloat(value))) {
      document.getElementById(id).value = value;
      const range = document.getElementById(id + "-range");
      if (range) range.value = value;
    }
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API (e.g. some local files)
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function wireCopyLink(btn, beforeCopy) {
  const original = btn.textContent;
  btn.addEventListener("click", async () => {
    beforeCopy();
    const ok = await copyText(location.href);
    btn.textContent = ok ? "Copied!" : "Couldn't copy";
    clearTimeout(btn._timer);
    btn._timer = setTimeout(() => (btn.textContent = original), 1600);
  });
}

/**
 * Called after every theme change, so the page can redraw its charts.
 * (The saved theme itself is applied by a tiny script in each page's <head>, before paint.)
 */
let onThemeChange = () => {};

function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function setTheme(theme, remember = true) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;

  const btn = document.getElementById("theme-toggle");
  const label =
    theme === "light" ? "Switch to dark theme" : "Switch to light theme";
  btn.setAttribute("aria-label", label);
  btn.title = label;

  if (remember) {
    try {
      localStorage.setItem("sip-theme", theme);
    } catch {
      // Storage blocked (private window etc.); the toggle still works for this visit
    }
  }
  onThemeChange(); // charts read their colours from the theme, so redraw them
}

/**
 * Wire the toggle button and draw the page for the first time
 */
function initTheme(redraw) {
  onThemeChange = redraw;
  document.getElementById("theme-toggle").addEventListener("click", () => {
    setTheme(currentTheme() === "light" ? "dark" : "light");
  });
  setTheme(currentTheme(), false);
}
