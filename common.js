const SVG_NS = "http://www.w3.org/2000/svg";

function formatINR(value) {
  return "₹" + Math.round(value).toLocaleString("en-IN");
}

/**
 * "₹1,234" or "−₹1,234"
 */
function formatINRSigned(v) {
  return v < -0.5 ? "−" + formatINR(-v) : formatINR(Math.max(0, v));
}

/**
 * Percentage with a sign: "+76.4%", "−3.2%"
 */
function formatPercent(value) {
  const r = Math.round(value * 10) / 10;
  return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1) + "%";
}

/**
 * Gain as a percentage of what was put in (0 when nothing was put in)
 */
function gainPercent(value, invested) {
  return invested > 0 ? ((value - invested) / invested) * 100 : 0;
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
 * - The monthly payment `P` rises at the start of every year, by `stepUp` (e.g. 0.1 = 10%)
 *   and/or by a fixed `stepUpAmount` in rupees.
 * - Each payment is made at the start of the month, then grows at monthly rate `i`.
 * - `inflation` (e.g. 0.06 = 6%) discounts each year's value back to today's money.
 * - `realInvested` is each payment counted at what it was worth in today's money
 *   when it was made, so it can be compared with `real`.
 * Returns one point per year, starting at year 0.
 */
function simulateSIP(P, i, stepUp, inflation, years, stepUpAmount = 0) {
  const points = [{ payment: 0, invested: 0, value: 0, real: 0, realInvested: 0, withdrawn: 0, realWithdrawn: 0 }];
  let invested = 0;
  let realInvested = 0;
  let value = 0;
  let payment = P;
  let monthIndex = 0;

  for (let yr = 1; yr <= years; yr++) {
    for (let month = 0; month < 12; month++) {
      invested += payment;
      realInvested += payment / Math.pow(1 + inflation, monthIndex / 12);
      value = (value + payment) * (1 + i);
      monthIndex++;
    }
    points.push({
      payment,
      invested,
      value,
      real: value / Math.pow(1 + inflation, yr),
      realInvested,
      withdrawn: 0,
      realWithdrawn: 0,
    });
    payment = payment * (1 + stepUp) + stepUpAmount;
  }
  return points;
}

/**
 * Monthly withdrawals (SWP) once investing stops, carrying on from `start` (the last point of simulateSIP)
 * after `startYear` years. The money stays invested at monthly rate `i`: each month it grows,
 * then the withdrawal is taken out, until nothing is left or `maxYears` have passed.
 * The first year's withdrawal is `W` a month; with `rise`, it goes up by `inflation` every year after that.
 * `realWithdrawn` counts each withdrawal at its value in today's money.
 * With `tax` ({ rate, exemption }), each withdrawal is part cost and part gain (average cost: the share of
 * the balance that was put in is not taxed). A year's gains above the exemption are taxed once, at the end
 * of the year, and the tax comes out of the money left (if none is left, it is still counted as owed).
 * Returns { points: one per year of withdrawals, months: withdrawals made, ranOut }.
 */
function simulateSWP(start, W, i, inflation, startYear, maxYears, rise = false, tax = null) {
  const points = [];
  let withdrawal = W;
  let value = start.value;
  let withdrawn = 0;
  let realWithdrawn = 0;
  let months = 0;
  let monthIndex = startYear * 12;
  let ranOut = false;
  let basis = start.invested; // what is still invested, at cost
  let taxPaid = 0;

  for (let yr = 1; yr <= maxYears && !ranOut; yr++) {
    if (yr > 1 && rise) withdrawal *= 1 + inflation;
    let gains = 0;
    for (let month = 0; month < 12; month++) {
      value *= 1 + i;
      const take = Math.min(withdrawal, value);
      const cost = value > 0 ? (basis * take) / value : 0;
      gains += take - cost;
      basis -= cost;
      value -= take;
      monthIndex++;
      withdrawn += take;
      realWithdrawn += take / Math.pow(1 + inflation, monthIndex / 12);
      months++;
      if (value < 0.005) {
        value = 0;
        ranOut = true;
        break;
      }
    }
    let taxThisYear = 0;
    if (tax) {
      taxThisYear = tax.rate * Math.max(0, gains - tax.exemption);
      const pay = Math.min(taxThisYear, value);
      if (value > 0) basis *= 1 - pay / value;
      value -= pay;
      taxPaid += taxThisYear;
      if (value < 0.005 && !ranOut) {
        value = 0;
        ranOut = true;
      }
    }
    points.push({
      payment: 0,
      invested: start.invested,
      realInvested: start.realInvested,
      value,
      real: value / Math.pow(1 + inflation, startYear + yr),
      withdrawn,
      realWithdrawn,
      withdrawal, // monthly withdrawal this year
      taxThisYear,
      taxPaid,
    });
  }
  return { points, months, ranOut };
}

/**
 * "23 years 4 months", "1 year", "5 months"
 */
function formatDuration(months) {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const part = (n, word) => (n ? `${n} ${word}${n === 1 ? "" : "s"}` : "");
  return [part(y, "year"), part(m, "month")].filter(Boolean).join(" ") || "0 months";
}

/**
 * Points where a rising line first reaches a milestone, for markers on a chart.
 * `values` has one number per year; `invested` (same length) is used for the "Doubled" marker (value twice what was put in).
 * Returns up to `max` markers as { x: fractional year, value, label }, most important first
 * (the chart skips any whose label would overlap one drawn before it).
 */
const MILESTONES = [1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9, 5e9, 1e10, 5e10, 1e11];

function findMilestones(values, invested, max = 3) {
  // First fractional year where f(year) goes from below 0 to 0 or above (straight lines between years)
  const firstCrossing = (f) => {
    for (let k = 1; k < values.length; k++) {
      const a = f(k - 1);
      const b = f(k);
      if (a < 0 && b >= 0) return k - 1 + -a / (b - a);
    }
    return null;
  };
  const at = (x) => {
    const lo = Math.floor(x);
    const hi = Math.min(values.length - 1, lo + 1);
    return values[lo] + (values[hi] - values[lo]) * (x - lo);
  };

  const found = [];
  MILESTONES.forEach((level) => {
    const x = firstCrossing((k) => values[k] - level);
    if (x !== null) found.push({ x, value: level, label: formatCompact(level) });
  });
  found.reverse(); // biggest first

  const doubled = firstCrossing((k) => (invested[k] > 0 ? values[k] - 2 * invested[k] : -1));
  if (doubled !== null) found.splice(1, 0, { x: doubled, value: at(doubled), label: "Doubled" });

  return found.slice(0, max);
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
 * `swatch` is a class like "value" or "invested"; `style` is optional inline CSS for the row
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
 *   height:  optional chart height in pixels (default 240)
 *   markers: optional [{ x: fractional year, value, label }] — labelled dots on the lines
 *   divider: optional { x: year, label } — a dashed vertical line, e.g. where withdrawals start
 *   xLabel: optional (year number) => text for the x axis (default "5y")
 *   ends:    optional { lines: [{ value, text, cls }], gap: [line1, line2] } — labels just past the
 *            right end of the lines, with a bracket between the two and `gap` written beside it
 *            (e.g. the final value, the amount invested, and the returns between them)
 *   Series can also set `width` (line thickness, default 2).
 */
function drawLineChart(
  container,
  { years, series, tooltip, ariaLabel, yMax: fixedMax, height = 240, markers = [], divider = null, ends = null, xLabel = (yr) => (yr === 0 ? "0" : yr + "y") },
) {
  container.innerHTML = "";
  if (!series) return;

  const width = container.clientWidth;
  const m = { top: 8, right: ends ? 70 : 8, bottom: 26, left: 52 }; // room on the right for end labels
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const yMax =
    fixedMax ?? niceMax(Math.max(...series.flatMap((s) => s.values)));
  const x = (yr) => m.left + (yr / years) * w;
  const y = (v) => m.top + h - (v / yMax) * h;

  // viewBox lets the chart scale without being redrawn
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
  const xStep = [1, 2, 5, 10, 20, 25].find((s) => s >= rawStep) || 25;
  for (let yr = 0; yr <= years; yr += xStep) {
    const label = el(
      "text",
      { x: x(yr), y: height - 6, "text-anchor": "middle" },
      svg,
    );
    label.textContent = xLabel(yr);
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
        "stroke-width": s.width ?? 2,
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

  // Divider: a dashed vertical line with a small label at the top
  if (divider) {
    const dx = x(divider.x);
    el(
      "line",
      {
        x1: dx,
        x2: dx,
        y1: m.top,
        y2: m.top + h,
        stroke: cssVar("--muted"),
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
        opacity: 0.7,
      },
      svg,
    );
    const label = el(
      "text",
      { x: dx + 6, y: m.top + 12, "text-anchor": "start", class: "chart-divider-label" },
      svg,
    );
    label.textContent = divider.label;
    // Not enough room on the right: put the label on the left of the line
    if (dx + 6 + label.getComputedTextLength() > m.left + w) {
      label.setAttribute("x", dx - 6);
      label.setAttribute("text-anchor", "end");
    }
  }

  // Milestone markers fade in once the lines have settled. They come most important first;
  // one whose dot or label would overlap a marker already drawn is left out.
  const markerDelay = !prev && !reduceMotion() ? REVEAL_MS : changed ? CHART_ANIM_MS : 0;
  const taken = []; // label boxes drawn so far
  markers.forEach((mk) => {
    const g = el("g", { class: "chart-marker", style: `animation-delay: ${markerDelay}ms` }, svg);
    const mx = x(mk.x);
    const my = y(mk.value);
    el("circle", { cx: mx, cy: my, r: 4, fill: cssVar("--surface"), stroke: cssVar("--text"), "stroke-width": 1.5 }, g);
    const label = el("text", { x: mx, y: my - 10, "text-anchor": "middle", class: "chart-marker-label" }, g);
    label.textContent = mk.label;
    const ly = my - 10 < m.top + 10 ? my + 18 : my - 10; // too close to the top: label below
    label.setAttribute("y", ly);

    const len = label.getComputedTextLength();
    let left = mx - len / 2;
    if (mx + len / 2 > m.left + w) {
      label.setAttribute("text-anchor", "end");
      left = mx - len;
    } else if (left < m.left) {
      label.setAttribute("text-anchor", "start");
      left = mx;
    }
    const box = { left: Math.min(left, mx - 5) - 4, right: Math.max(left + len, mx + 5) + 4, top: Math.min(ly - 11, my - 5), bottom: Math.max(ly + 2, my + 5) };
    const overlaps = taken.some((t) => box.left < t.right && box.right > t.left && box.top < t.bottom && box.bottom > t.top);
    if (overlaps) g.remove();
    else taken.push(box);
  });

  // End labels: the two lines' final values, with a bracket and the gap between them
  if (ends) {
    const g = el("g", { class: "chart-marker", style: `animation-delay: ${markerDelay}ms` }, svg);
    const [upper, lower] = [...ends.lines].sort((a, b) => b.value - a.value);
    const bx = x(years) + 8; // bracket
    const tx = bx + 9; // text
    const yU = y(upper.value);
    const yL = y(lower.value);
    el(
      "path",
      {
        d: `M${bx - 3} ${yU} h3 V${yL} h-3`,
        fill: "none",
        stroke: cssVar("--muted"),
        "stroke-width": 1,
        opacity: 0.6,
      },
      g,
    );
    // Keep the two labels apart when the lines end close together
    const mid = (yU + yL) / 2;
    const room = yL - yU;
    const upY = room < 26 ? mid - 6 : yU + 4;
    const lowY = room < 26 ? mid + 14 : yL + 4;
    const label = (text, ty, cls) => {
      const t = el("text", { x: tx, y: ty, class: cls }, g);
      t.textContent = text;
    };
    label(upper.text, upY, upper.cls);
    label(lower.text, lowY, lower.cls);
    if (ends.gap && room >= 60) {
      label(ends.gap[0], mid + 1, "chart-end-gap");
      label(ends.gap[1], mid + 13, "chart-end-gap-note");
    }
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
 * The "Total value / In today's money" tabs in `.view-bar`, which control `#charts-panel`.
 * Calls `onChange(mode)` with "total" or "real" when the selected tab changes,
 * and shows `#view-note` only in the today's-money view.
 * Arrow keys move between tabs, as is usual for tab controls.
 */
function wireViewTabs(onChange) {
  const tabs = [...document.querySelectorAll('.view-bar [role="tab"]')];
  const panel = document.getElementById("charts-panel");
  const note = document.getElementById("view-note");

  const select = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", tab.id);
    if (note) note.hidden = tab.dataset.mode !== "real";
    if (focus) tab.focus();
    onChange(tab.dataset.mode);
  };

  tabs.forEach((tab, idx) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tabs[(idx + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next, true);
    });
  });
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
 * Keep `value` within a number box's min and max (as text, "" left alone)
 */
function clampToLimits(input, value) {
  if (value === "" || isNaN(parseFloat(value))) return value;
  let v = parseFloat(value);
  if (input.max !== "") v = Math.min(v, parseFloat(input.max));
  if (input.min !== "") v = Math.max(v, parseFloat(input.min));
  return String(v);
}

/**
 * Wire each number box (#id): call onChange on every edit and keep it within its limits.
 * A value above the box's max snaps down straight away; one below its min is corrected when
 * you leave the box, so you can still type e.g. "5000" one digit at a time.
 */
function wireInputs(ids, onChange) {
  ids.forEach((id) => {
    const number = document.getElementById(id);

    number.addEventListener("input", () => {
      if (number.max !== "" && parseFloat(number.value) > parseFloat(number.max)) number.value = number.max;
      onChange();
    });

    // Scrolling over the box nudges the value by one step (up for scroll up), within its limits
    number.addEventListener(
      "wheel",
      (event) => {
        if (number.disabled || event.deltaY === 0) return;
        event.preventDefault();
        const step = parseFloat(number.step) || 1;
        const current = parseFloat(number.value);
        let next = (isNaN(current) ? parseFloat(number.min) || 0 : current) + (event.deltaY < 0 ? step : -step);
        next = Math.round(next / step) * step; // no drift from decimal steps like 0.5
        number.value = clampToLimits(number, String(parseFloat(next.toFixed(6))));
        number.dispatchEvent(new Event("input", { bubbles: true }));
      },
      { passive: false },
    );

    number.addEventListener("change", () => {
      const fixed = clampToLimits(number, number.value);
      if (fixed === number.value) return;
      number.value = fixed;
      onChange();
    });
  });
}

/**
 * Step-up can be a percentage or a fixed amount in rupees. A `.unit-toggle[data-unit-for="<id>"]`
 * switches the box #<id> between the two, with these limits.
 */
const STEP_UP_UNITS = {
  percent: { min: 0, max: 25, step: 1 },
  amount: { min: 0, max: 50000, step: 500 },
};

function stepUpUnit(id) {
  const toggle = document.querySelector(`.unit-toggle[data-unit-for="${id}"]`);
  return toggle ? toggle.dataset.unit : "percent";
}

/**
 * Switch #<id> to `unit`. With `base` (the monthly amount), the current value is converted
 * so the step-up stays about the same, e.g. 10% of ₹10,000 becomes ₹1,000.
 */
function setStepUpUnit(id, unit, base) {
  const toggle = document.querySelector(`.unit-toggle[data-unit-for="${id}"]`);
  if (!toggle) return;
  const from = toggle.dataset.unit;
  toggle.dataset.unit = unit;
  toggle.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.unit === unit));

  const limits = STEP_UP_UNITS[unit];
  const number = document.getElementById(id);
  number.min = limits.min;
  number.max = limits.max;
  number.step = limits.step;
  number.setAttribute("aria-label", unit === "amount" ? "Step-up in rupees" : "Step-up in percent");

  if (base !== undefined && from !== unit && number.value !== "") {
    const v = parseFloat(number.value);
    const converted = unit === "amount" ? (base * v) / 100 : base > 0 ? (v / base) * 100 : 0;
    const snapped = Math.round(converted / limits.step) * limits.step;
    number.value = Math.min(limits.max, Math.max(limits.min, snapped));
  }
}

/**
 * Wire every unit toggle on the page. `baseOf(id)` gives the monthly amount used to convert values.
 */
function wireStepUpUnits(baseOf, onChange) {
  document.querySelectorAll(".unit-toggle").forEach((toggle) => {
    const id = toggle.dataset.unitFor;
    toggle.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.unit === toggle.dataset.unit) return;
        setStepUpUnit(id, btn.dataset.unit, baseOf(id));
        onChange();
      }),
    );
  });
}

/**
 * Put every box back to the value written in the HTML
 */
function resetFields(ids) {
  document.querySelectorAll(".unit-toggle").forEach((t) => setStepUpUnit(t.dataset.unitFor, "percent"));
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => (box.checked = box.defaultChecked));
  ids.forEach((id) => {
    const number = document.getElementById(id);
    number.value = number.defaultValue;
  });
}

function saveToURL(ids) {
  const params = new URLSearchParams();
  ids.forEach((id) => params.set(id, document.getElementById(id).value));
  document.querySelectorAll(".unit-toggle").forEach((t) => {
    if (t.dataset.unit === "amount") params.set(t.dataset.unitFor + "-unit", "amount");
  });
  // Switches are only written when they differ from their default
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => {
    if (box.checked !== box.defaultChecked) params.set(box.id, box.checked ? "1" : "0");
  });
  try {
    history.replaceState(null, "", "?" + params.toString());
  } catch {
    // Some browsers block this for local files; the page still works
  }
}

/**
 * Run before wireInputs so the boxes start from the loaded values
 */
function loadFromURL(ids) {
  const params = new URLSearchParams(location.search);
  // Units first, so values are checked against the right limits
  document.querySelectorAll(".unit-toggle").forEach((t) => {
    if (params.get(t.dataset.unitFor + "-unit") === "amount") setStepUpUnit(t.dataset.unitFor, "amount");
  });
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => {
    const value = params.get(box.id);
    if (value === "1" || value === "0") box.checked = value === "1";
  });
  ids.forEach((id) => {
    const value = params.get(id);
    if (value !== null && value !== "" && !isNaN(parseFloat(value))) {
      const input = document.getElementById(id);
      input.value = clampToLimits(input, value); // links can't go past the limits either
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
