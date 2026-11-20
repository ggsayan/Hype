const pieEl = document.getElementById("pie-chart");
const pieLegendEl = document.getElementById("pie-legend");

/**
 * Pie (donut) chart size. The chart is built once, then updated in place
 * so its segments can sweep to their new sizes.
 */
const PIE_SIZE = 180;
const PIE_STROKE = 26;
const PIE_R = (PIE_SIZE - PIE_STROKE) / 2;
const PIE_C = 2 * Math.PI * PIE_R; // circumference

function buildPie() {
  pieEl.innerHTML = "";
  pieLegendEl.innerHTML = "";
  const mid = PIE_SIZE / 2;

  const svg = el(
    "svg",
    {
      width: PIE_SIZE,
      height: PIE_SIZE,
      viewBox: `0 0 ${PIE_SIZE} ${PIE_SIZE}`,
      role: "img",
      "aria-label": "Donut chart of invested amount versus returns",
    },
    pieEl,
  );
  const g = el("g", { transform: `rotate(-90 ${mid} ${mid})` }, svg);

  const segs = ["invested", "returns"].map((key) => {
    const arc = el(
      "circle",
      {
        cx: mid,
        cy: mid,
        r: PIE_R,
        fill: "none",
        "stroke-width": PIE_STROKE,
        "pointer-events": "stroke",
        style: "cursor: default; transition: opacity 0.15s",
      },
      g,
    );

    arc.addEventListener("pointermove", (e) => {
      const state = pieEl._state;
      const value = state[key];
      const label =
        key === "invested" ? "Invested" : VIEW_MODES[viewMode].returnsLabel;
      svg
        .querySelectorAll("circle")
        .forEach((other) => (other.style.opacity = other === arc ? 1 : 0.45));
      showTooltip(
        tooltipRow(key, label, formatINRSigned(value)) +
          tooltipRow(
            "",
            "Share",
            ((value / state.total) * 100).toFixed(1) + "%",
            "color:var(--muted)",
          ),
        e.clientX,
        e.clientY,
      );
    });
    arc.addEventListener("pointerleave", () => {
      svg
        .querySelectorAll("circle")
        .forEach((other) => (other.style.opacity = 1));
      hideTooltip();
    });

    // Legend row with value and share
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<i class="swatch ${key}"></i><span class="name"></span><span class="val"></span><span class="pct"></span>`;
    pieLegendEl.appendChild(row);

    return {
      key,
      arc,
      name: row.querySelector(".name"),
      val: row.querySelector(".val"),
      pct: row.querySelector(".pct"),
    };
  });

  const centerLabel = el(
    "text",
    { x: mid, y: mid - 6, "text-anchor": "middle", class: "pie-center-label" },
    svg,
  );
  const center = el(
    "text",
    { x: mid, y: mid + 14, "text-anchor": "middle", class: "pie-center-value" },
    svg,
  );

  pieEl._parts = { segs, center, centerLabel };
}

/**
 * Draw both segments for a given invested share (0 to 1), with a 2px gap between them
 */
function renderPie(share) {
  const [inv, ret] = pieEl._parts.segs;
  const lenInv = share * PIE_C;
  const lenRet = PIE_C - lenInv;
  const gap = lenInv > 1 && lenRet > 1 ? 2 : 0;
  inv.arc.setAttribute(
    "stroke-dasharray",
    `${Math.max(0, lenInv - gap)} ${PIE_C}`,
  );
  inv.arc.setAttribute("stroke-dashoffset", 0);
  ret.arc.setAttribute(
    "stroke-dasharray",
    `${Math.max(0, lenRet - gap)} ${PIE_C}`,
  );
  ret.arc.setAttribute("stroke-dashoffset", -lenInv);
  pieEl._shareShown = share;
}

/**
 * Draw the pie for the final year `end` (or clear it when `end` is null), in the current tab's view
 */
function drawPieChart(end) {
  cancelAnimationFrame(pieEl._anim);
  if (!end) {
    pieEl.innerHTML = "";
    pieLegendEl.innerHTML = "";
    pieEl._parts = null;
    pieEl._shareShown = null;
    return;
  }
  if (!pieEl._parts) buildPie();

  const mode = VIEW_MODES[viewMode];
  // Work in whole rupees so the two slices always add up exactly to the total shown
  const invested = Math.round(end[mode.investedKey]);
  const returns = Math.round(end[mode.valueKey]) - invested;
  const total = invested + returns;
  pieEl._state = { invested, returns, total };
  const { segs, center, centerLabel } = pieEl._parts;

  // Labels depend on the view, so set them on every draw
  centerLabel.textContent = mode.valueLabel;
  segs[0].name.textContent = "Invested";
  segs[1].name.textContent = mode.returnsLabel;
  segs[0].arc.setAttribute("stroke", cssVar("--series-invested"));
  segs[1].arc.setAttribute("stroke", cssVar("--series-value"));

  // If returns don't beat inflation, the ring is all "Invested"
  const ringTotal = invested + Math.max(0, returns);
  const share = ringTotal > 0 ? invested / ringTotal : 1;

  // Sweep from the share currently on screen to the new one
  const from = pieEl._shareShown;
  if (from == null || reduceMotion() || Math.abs(from - share) < 0.0005) {
    renderPie(share);
  } else {
    let start = null;
    const step = (now) => {
      if (start === null) start = now;
      const t = easeOutCubic(Math.min(1, (now - start) / CHART_ANIM_MS));
      renderPie(from + (share - from) * t);
      if (t < 1) pieEl._anim = requestAnimationFrame(step);
    };
    pieEl._anim = requestAnimationFrame(step);
  }

  animateNumber(center, total, formatINR);
  segs.forEach((s) =>
    animateNumber(s.val, pieEl._state[s.key], formatINRSigned),
  );

  if (returns < 0) {
    setStaticText(segs[0].pct, "");
    setStaticText(segs[1].pct, "Didn't beat inflation");
  } else {
    segs.forEach((s) =>
      animateNumber(
        s.pct,
        total > 0 ? (pieEl._state[s.key] / total) * 100 : 0,
        (p) => p.toFixed(1) + "% of total",
      ),
    );
  }
}
