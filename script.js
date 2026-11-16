const fields = ["amount", "lumpsum", "stepup", "rate", "inflation", "years"];

const lineEl = document.getElementById("line-chart");
const pieEl = document.getElementById("pie-chart");
const pieLegendEl = document.getElementById("pie-legend");

let lastData = null; // most recent yearly series, reused when the window resizes

function drawGrowthChart(data) {
  if (!data) {
    lineEl.innerHTML = "";
    return;
  }
  drawLineChart(lineEl, {
    years: data.length - 1,
    ariaLabel: "Line chart of invested amount, total value and value in today's money by year",
    series: [
      { values: data.map((d) => d.invested), color: cssVar("--series-invested") },
      { values: data.map((d) => d.real), color: cssVar("--series-value"), dash: "5 4" },
      { values: data.map((d) => d.value), color: cssVar("--series-value"), area: true },
    ],
    tooltip: (yr) => {
      const d = data[yr];
      return (
        `<div class="tt-title">After ${yr} year${yr === 1 ? "" : "s"}</div>` +
        tooltipRow("value", "Total value", formatINR(d.value)) +
        tooltipRow("real", "In today's money", formatINR(d.real)) +
        tooltipRow("invested", "Invested", formatINR(d.invested))
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

function buildPie() {
  pieEl.innerHTML = "";
  pieLegendEl.innerHTML = "";
  const mid = PIE_SIZE / 2;

  const svg = el("svg", { width: PIE_SIZE, height: PIE_SIZE, viewBox: `0 0 ${PIE_SIZE} ${PIE_SIZE}`, role: "img", "aria-label": "Donut chart of invested amount versus estimated returns" }, pieEl);
  const g = el("g", { transform: `rotate(-90 ${mid} ${mid})` }, svg);

  const segs = [
    { key: "invested", label: "Invested" },
    { key: "returns", label: "Est. returns" },
  ].map((s) => {
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
      const { total } = pieEl._state;
      const value = pieEl._state[s.key];
      svg.querySelectorAll("circle").forEach((other) => (other.style.opacity = other === arc ? 1 : 0.45));
      showTooltip(
        tooltipRow(s.key, s.label, formatINR(value)) +
          tooltipRow("", "Share", ((value / total) * 100).toFixed(1) + "%", "color:var(--muted)"),
        e.clientX,
        e.clientY
      );
    });
    arc.addEventListener("pointerleave", () => {
      svg.querySelectorAll("circle").forEach((other) => (other.style.opacity = 1));
      hideTooltip();
    });

    // Legend row with value and share
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<i class="swatch ${s.key}"></i><span>${s.label}</span><span class="val"></span><span class="pct"></span>`;
    pieLegendEl.appendChild(row);

    return { ...s, arc, val: row.querySelector(".val"), pct: row.querySelector(".pct") };
  });

  const label = el("text", { x: mid, y: mid - 6, "text-anchor": "middle", class: "pie-center-label" }, svg);
  label.textContent = "Total value";
  const center = el("text", { x: mid, y: mid + 14, "text-anchor": "middle", class: "pie-center-value" }, svg);

  pieEl._parts = { segs, center };
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

function drawPieChart(invested, returns) {
  cancelAnimationFrame(pieEl._anim);
  if (invested === null) {
    pieEl.innerHTML = "";
    pieLegendEl.innerHTML = "";
    pieEl._parts = null;
    pieEl._shareShown = null;
    return;
  }
  if (!pieEl._parts) buildPie();

  const total = invested + returns;
  pieEl._state = { invested, returns, total };
  const { segs, center } = pieEl._parts;

  // Colours come from the theme, so set them on every draw
  segs[0].arc.setAttribute("stroke", cssVar("--series-invested"));
  segs[1].arc.setAttribute("stroke", cssVar("--series-value"));

  // Sweep from the share currently on screen to the new one
  const share = total > 0 ? invested / total : 1;
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
  segs.forEach((s) => {
    const value = pieEl._state[s.key];
    animateNumber(s.val, value, formatINR);
    animateNumber(s.pct, total > 0 ? (value / total) * 100 : 0, (p) => p.toFixed(1) + "% of total");
  });
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

function drawTable(data) {
  const body = document.getElementById("year-table");
  body.innerHTML = "";
  if (!data) return;

  data.slice(1).forEach((d, idx) => {
    const tr = document.createElement("tr");
    [String(idx + 1), formatINR(d.payment), formatINR(d.invested), formatINR(d.value), formatINR(d.real)].forEach((text, col) => {
      const cell = document.createElement(col === 0 ? "th" : "td");
      if (col === 0) cell.scope = "row";
      cell.textContent = text;
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
    drawPieChart(null, null);
    drawTable(null);
    return;
  }

  lastData = simulateSIP(P, lumpSum, annualRate / 12 / 100, stepUp / 100, inflation / 100, years);

  const end = lastData[years];
  showResults({
    invested: end.invested,
    "final-sip": end.payment,
    returns: end.value - end.invested,
    total: end.value,
    "total-words": end.value,
    real: end.real,
  });
  drawTable(lastData);
  drawGrowthChart(lastData);
  drawPieChart(end.invested, Math.max(0, end.value - end.invested));
  saveToURL(fields);
}

function downloadCSV() {
  if (!lastData) return;
  const rows = [["Year", "Monthly SIP", "Invested so far", "Value", "In today's money"]];
  lastData.slice(1).forEach((d, idx) => {
    rows.push([idx + 1, d.payment, d.invested, d.value, d.real].map((v, col) => (col === 0 ? v : Math.round(v))));
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

/**
 * Print in the light theme with the table open, then put everything back
 */
let beforePrint = null;

window.addEventListener("beforeprint", () => {
  const details = document.querySelector(".table-block");
  beforePrint = { theme: currentTheme(), tableOpen: details.open };
  details.open = true;
  if (beforePrint.theme !== "light") setTheme("light", false);
});

window.addEventListener("afterprint", () => {
  if (!beforePrint) return;
  document.querySelector(".table-block").open = beforePrint.tableOpen;
  if (beforePrint.theme !== "light") setTheme(beforePrint.theme, false);
  beforePrint = null;
});

loadFromURL(fields);
wireSliders(fields, calculateSIP);
wireInfoIcons();
wireCopyLink(document.getElementById("copy-link"), () => saveToURL(fields));

document.getElementById("reset").addEventListener("click", () => {
  resetFields(fields);
  calculateSIP();
});
document.getElementById("download-csv").addEventListener("click", downloadCSV);
document.getElementById("print").addEventListener("click", () => window.print());

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

initTheme(calculateSIP); // sets the theme button's label and draws everything
