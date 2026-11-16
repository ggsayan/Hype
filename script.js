const fields = ["amount", "lumpsum", "stepup", "rate", "inflation", "years"];

const lineEl = document.getElementById("line-chart");
const pieEl = document.getElementById("pie-chart");

let lastData = null; // most recent yearly series, reused when the window resizes or the view changes

/**
 * The two views, chosen with the tabs at the top of the charts.
 * In today's money, every payment is counted at its value in today's money when it was made,
 * so "Invested" and the value are in the same kind of rupees and can be compared directly.
 */
const VIEW_MODES = {
  total: {
    valueKey: "value",
    investedKey: "invested",
    valueLabel: "Total value",
    returnsLabel: "Est. returns",
  },
  real: {
    valueKey: "real",
    investedKey: "realInvested",
    valueLabel: "In today's money",
    returnsLabel: "Real returns",
  },
};

let viewMode = "total";

function drawGrowthChart(data) {
  if (!data) {
    lineEl.innerHTML = "";
    return;
  }
  const mode = VIEW_MODES[viewMode];
  drawLineChart(lineEl, {
    years: data.length - 1,
    ariaLabel: `Line chart of amount invested and ${mode.valueLabel.toLowerCase()} by year`,
    height: 200,
    series: [
      { values: data.map((d) => d[mode.investedKey]), color: cssVar("--series-invested") },
      { values: data.map((d) => d[mode.valueKey]), color: cssVar("--series-value"), area: true },
    ],
    tooltip: (yr) => {
      const d = data[yr];
      return (
        `<div class="tt-title">After ${yr} year${yr === 1 ? "" : "s"}</div>` +
        tooltipRow("value", mode.valueLabel, formatINR(d[mode.valueKey])) +
        tooltipRow("invested", "Invested", formatINR(d[mode.investedKey]))
      );
    },
  });
}

/**
 * Pie (donut) chart size. The chart is built once, then updated in place
 * so its segments can sweep to their new sizes.
 */
const PIE_SIZE = 180;
const PIE_STROKE = 26;
const PIE_R = (PIE_SIZE - PIE_STROKE) / 2;
const PIE_C = 2 * Math.PI * PIE_R; // circumference

let pieEnd = null; // final year of the latest calculation, reused when switching views

function buildPie() {
  pieEl.innerHTML = "";
  const mid = PIE_SIZE / 2;

  const svg = el("svg", { width: PIE_SIZE, height: PIE_SIZE, viewBox: `0 0 ${PIE_SIZE} ${PIE_SIZE}`, role: "img", "aria-label": "Donut chart of invested amount versus returns" }, pieEl);
  const g = el("g", { transform: `rotate(-90 ${mid} ${mid})` }, svg);

  const segs = ["invested", "returns"].map((key) => {
    const arc = el("circle", {
      cx: mid,
      cy: mid,
      r: PIE_R,
      fill: "none",
      "stroke-width": PIE_STROKE,
      "pointer-events": "stroke",
      style: "cursor: default; transition: opacity 0.15s",
    }, g);

    arc.addEventListener("pointermove", (e) => {
      const state = pieEl._state;
      const value = state[key];
      const label = key === "invested" ? "Invested" : VIEW_MODES[viewMode].returnsLabel;
      svg.querySelectorAll("circle").forEach((other) => (other.style.opacity = other === arc ? 1 : 0.45));
      showTooltip(
        tooltipRow(key, label, formatINRSigned(value)) +
          tooltipRow("", "Share", ((value / state.total) * 100).toFixed(1) + "%", "color:var(--muted)"),
        e.clientX,
        e.clientY
      );
    });
    arc.addEventListener("pointerleave", () => {
      svg.querySelectorAll("circle").forEach((other) => (other.style.opacity = 1));
      hideTooltip();
    });

    return { key, arc };
  });

  const centerLabel = el("text", { x: mid, y: mid - 6, "text-anchor": "middle", class: "pie-center-label" }, svg);
  const center = el("text", { x: mid, y: mid + 14, "text-anchor": "middle", class: "pie-center-value" }, svg);

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
  inv.arc.setAttribute("stroke-dasharray", `${Math.max(0, lenInv - gap)} ${PIE_C}`);
  inv.arc.setAttribute("stroke-dashoffset", 0);
  ret.arc.setAttribute("stroke-dasharray", `${Math.max(0, lenRet - gap)} ${PIE_C}`);
  ret.arc.setAttribute("stroke-dashoffset", -lenInv);
  pieEl._shareShown = share;
}

/**
 * Draw the pie for the final year `end` (or clear it when `end` is null), in the current tab's view
 */
function drawPieChart(end) {
  cancelAnimationFrame(pieEl._anim);
  pieEnd = end;
  if (!end) {
    pieEl.innerHTML = "";
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

  // Labels depend on the view; colours come from the theme, so set them on every draw
  centerLabel.textContent = mode.valueLabel;
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

  animateNumber(center, total, formatCompact);
}

/**
 * How each result is displayed
 */
const resultFormats = {
  invested: formatINR,
  "final-sip": (v) => formatINR(v) + "/month",
  returns: formatINR,
  total: formatINR,
  "total-words": formatWords,
  real: formatINR,
  gain: formatPercent,
  "real-gain": formatPercent,
};

/**
 * `values` maps each result id to a number, which counts smoothly to its new value.
 * Called with nothing, every result shows "-".
 */
function showResults(values) {
  for (const id in resultFormats) {
    const node = document.getElementById(id);
    if (values) animateNumber(node, values[id], resultFormats[id]);
    else setStaticText(node, id === "total-words" ? "" : "-");
  }
}

/**
 * Columns of the year-by-year table and its CSV, in order.
 * Amounts are whole rupees, so each row adds up exactly as shown.
 */
const TABLE_COLUMNS = [
  { label: "Year", get: (r) => r.year, show: String },
  { label: "Monthly SIP", get: (r) => r.payment, show: formatINR },
  { label: "Invested this year", get: (r) => r.investedThisYear, show: formatINR },
  { label: "Invested so far", get: (r) => r.invested, show: formatINR },
  { label: "Returns this year", get: (r) => r.returnsThisYear, show: formatINRSigned },
  { label: "Returns so far", get: (r) => r.returns, show: formatINRSigned },
  { label: "Value", get: (r) => r.value, show: formatINR },
  { label: "Gain", get: (r) => r.gain, show: formatPercent, csv: (v) => v.toFixed(1) + "%" },
  { label: "In today's money", get: (r) => r.real, show: formatINR },
  { label: "Real gain", get: (r) => r.realGain, show: formatPercent, csv: (v) => v.toFixed(1) + "%" },
];

/**
 * One row per year. Year 1 counts the lump sum as invested that year.
 */
function tableRows(data) {
  const R = Math.round;
  return data.slice(1).map((d, idx) => {
    const prev = idx === 0 ? { invested: 0, value: 0 } : data[idx];
    const investedThisYear = R(d.invested) - R(prev.invested);
    return {
      year: idx + 1,
      payment: R(d.payment),
      investedThisYear,
      invested: R(d.invested),
      returnsThisYear: R(d.value) - R(prev.value) - investedThisYear,
      returns: R(d.value) - R(d.invested),
      value: R(d.value),
      gain: gainPercent(d.value, d.invested),
      real: R(d.real),
      realGain: gainPercent(d.real, d.realInvested),
    };
  });
}

function drawTable(data) {
  const body = document.getElementById("year-table");
  body.innerHTML = "";
  if (!data) return;

  tableRows(data).forEach((row) => {
    const tr = document.createElement("tr");
    TABLE_COLUMNS.forEach((col, i) => {
      const cell = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) cell.scope = "row";
      cell.textContent = col.show(col.get(row));
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
}

function calculateSIP() {
  const P = parseFloat(document.getElementById("amount").value);
  const annualRate = parseFloat(document.getElementById("rate").value);
  const years = Math.round(parseFloat(document.getElementById("years").value));
  // Empty optional boxes mean "none"
  const stepUp = readOptional("stepup", 0);
  const inflation = readOptional("inflation", 0);
  const lumpSum = readOptional("lumpsum", 0);

  if (
    [P, annualRate, years, stepUp, inflation, lumpSum].some(isNaN) ||
    P <= 0 || years <= 0 || annualRate < 0 || stepUp < 0 || inflation < 0 || lumpSum < 0
  ) {
    showResults();
    lastData = null;
    drawGrowthChart(null);
    drawPieChart(null);
    drawTable(null);
    return;
  }

  lastData = simulateSIP(P, lumpSum, annualRate / 12 / 100, stepUp / 100, inflation / 100, years);

  const end = lastData[years];
  showResults({
    invested: end.invested,
    "final-sip": end.payment,
    returns: Math.round(end.value) - Math.round(end.invested), // adds up exactly to the rupees shown
    total: end.value,
    "total-words": end.value,
    real: end.real,
    gain: gainPercent(end.value, end.invested),
    "real-gain": gainPercent(end.real, end.realInvested),
  });
  drawTable(lastData);
  drawGrowthChart(lastData);
  drawPieChart(end);
  saveToURL(fields);
}

function downloadCSV() {
  if (!lastData) return;
  const rows = [TABLE_COLUMNS.map((col) => col.label)];
  tableRows(lastData).forEach((row) => {
    rows.push(TABLE_COLUMNS.map((col) => (col.csv ? col.csv(col.get(row)) : col.get(row))));
  });
  const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\r\n");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "sip-year-by-year.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

loadFromURL(fields);
wireSliders(fields, calculateSIP);
wireInfoIcons();
wireCopyLink(document.getElementById("copy-link"), () => saveToURL(fields));

document.getElementById("reset").addEventListener("click", () => {
  resetFields(fields);
  calculateSIP();
});
document.getElementById("download-csv").addEventListener("click", downloadCSV);

// "Compare plans" opens the comparison with this plan already filled in as Plan A
document.getElementById("compare-link").addEventListener("click", (e) => {
  e.preventDefault();
  const params = new URLSearchParams();
  ["amount", "lumpsum", "stepup", "rate"].forEach((id) => params.set("a-" + id, document.getElementById(id).value));
  ["inflation", "years"].forEach((id) => params.set(id, document.getElementById(id).value));
  location.href = "compare.html?" + params.toString();
});

// Redraw the line chart when its width changes
onWidthChange(lineEl, () => drawGrowthChart(lastData));

// The year-by-year table slides open and closed
animateDetails(document.querySelector(".table-block"));

// Tabs at the top of the charts switch both charts between total value and today's money
wireViewTabs((mode) => {
  viewMode = mode;
  document.getElementById("legend-value").textContent = VIEW_MODES[mode].valueLabel;
  drawGrowthChart(lastData);
  drawPieChart(pieEnd);
});

initTheme(calculateSIP); // sets the theme button's label and draws everything
