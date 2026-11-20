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
 * Draws a line chart into `container`.
 *   years:   number of years (x axis runs 0..years)
 *   series:  [{ values: [...one per year], color, area? }] — drawn in this order, last on top
 *   tooltip: (year) => HTML for the hover tooltip
 *   yCap:    optional highest the y axis may go; lines above it run off the top of the chart
 *   height:  optional chart height in pixels (default 240)
 *   markers: optional [{ x: fractional year, value, label }] — labelled dots on the lines
 *   divider: optional { x: year, label } — a dashed vertical line, e.g. where withdrawals start
 *   xLabel:  (year number) => text for the x axis
 *   ends:    optional { lines: [{ value, text, cls }], gap: [line1, line2] } — labels just past the
 *            right end of the lines, with a bracket between the two and `gap` written beside it
 *            (e.g. the final value, the amount invested, and the returns between them)
 */
function drawLineChart(
  container,
  { years, series, tooltip, ariaLabel, yCap = Infinity, height = 240, markers = [], divider = null, ends = null, xLabel },
) {
  container.innerHTML = "";
  if (!series) return;

  const width = container.clientWidth;
  const m = { top: 8, right: ends ? 70 : 8, bottom: 26, left: 52 }; // room on the right for end labels
  const w = width - m.left - m.right;
  const h = height - m.top - m.bottom;

  const highest = Math.max(...series.flatMap((s) => s.values));
  const yMax = highest > yCap ? yCap : niceMax(highest);
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
    label.textContent = formatINR(v);
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
  // Lines and areas stay inside the plot, so anything above the axis is cut off at the top
  const plotClipId = `${container.id}-plot`;
  el("rect", { x: 0, y: m.top, width, height: h + m.bottom }, el("clipPath", { id: plotClipId }, defs));
  const plot = el("g", { "clip-path": `url(#${plotClipId})` }, svg);
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
    return el("path", { fill: `url(#${id})` }, plot);
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
      },
      plot,
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
    if (mk.value > yMax) return; // off the top of the chart
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
    const yU = Math.max(m.top, y(upper.value)); // a line that ran off the top is labelled at the top
    const yL = Math.max(m.top, y(lower.value));
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
    el(
      "circle",
      { r: 4.5, fill: s.color, stroke: cssVar("--surface"), "stroke-width": 2 },
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

    goal = { x: x(yr), ys: series.map((s) => Math.max(m.top, y(s.values[yr]))) };
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
