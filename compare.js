const planFields = [
  { key: "amount", label: "Monthly SIP (₹)", min: 1000, max: 500000, step: 1000 },
  { key: "lumpsum", label: "Lump Sum (₹)", min: 0, max: 10000000, step: 10000 },
  { key: "stepup", label: "Step-up (%)", min: 0, max: 25, step: 1 },
  { key: "rate", label: "Return (%)", min: 0, max: 25, step: 0.5 },
];

/**
 * Starting example: "₹10,000 with 10% step-up" vs "₹15,000 flat"
 */
const defaults = {
  a: { amount: 10000, lumpsum: 0, stepup: 10, rate: 12 },
  b: { amount: 15000, lumpsum: 0, stepup: 0, rate: 12 },
};

["a", "b"].forEach((plan) => {
  const box = document.getElementById(plan + "-fields");
  planFields.forEach((f) => {
    const id = `${plan}-${f.key}`;
    const value = defaults[plan][f.key];
    const field = document.createElement("div");
    field.className = "field";
    field.innerHTML = `
      <div class="field-head">
        <label for="${id}">${f.label}</label>
        <input type="number" id="${id}" value="${value}" min="${f.min}" max="${f.max}" step="${f.step}" />
      </div>
      <input type="range" id="${id}-range" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}"
        aria-label="Plan ${plan.toUpperCase()} ${f.label}" />`;
    box.appendChild(field);
  });
});

const ids = [...["a", "b"].flatMap((p) => planFields.map((f) => `${p}-${f.key}`)), "years", "inflation"];
const chartEl = document.getElementById("compare-chart");

let last = null; // { a, b, years } from the latest calculation

/**
 * The two views, chosen with the tabs above the summary and the chart.
 * In today's money, every payment is counted at its value in today's money when it was made,
 * so the invested amount and the value can be compared directly.
 */
const VIEW_MODES = {
  total: {
    valueKey: "value",
    investedKey: "invested",
    valueLabel: "Total value",
    investedLabel: "Total invested",
    returnsLabel: "Returns",
    gainLabel: "Total gain",
  },
  real: {
    valueKey: "real",
    investedKey: "realInvested",
    valueLabel: "In today's money",
    investedLabel: "Invested (today's money)",
    returnsLabel: "Real returns",
    gainLabel: "Real gain",
  },
};

let viewMode = "total";

function readPlan(p, years, inflation) {
  const P = parseFloat(document.getElementById(`${p}-amount`).value);
  const rate = parseFloat(document.getElementById(`${p}-rate`).value);
  const lumpSum = readOptional(`${p}-lumpsum`, 0);
  const stepUp = readOptional(`${p}-stepup`, 0);
  if ([P, rate, lumpSum, stepUp].some(isNaN) || P <= 0 || rate < 0 || lumpSum < 0 || stepUp < 0) return null;

  return { P, rate, lumpSum, stepUp, data: simulateSIP(P, lumpSum, rate / 12 / 100, stepUp / 100, inflation / 100, years) };
}

/**
 * "+₹1,234" / "−₹1,234" / "₹0"
 */
function formatSigned(v) {
  const r = Math.round(v);
  return (r > 0 ? "+" : r < 0 ? "−" : "") + formatINR(Math.abs(r));
}

function update() {
  const years = Math.round(parseFloat(document.getElementById("years").value));
  const inflation = readOptional("inflation", 0);
  const valid = !isNaN(years) && years > 0 && !isNaN(inflation) && inflation >= 0;

  const a = valid ? readPlan("a", years, inflation) : null;
  const b = valid ? readPlan("b", years, inflation) : null;

  if (!a || !b) {
    last = null;
    chartEl.innerHTML = "";
    document.getElementById("compare-body").innerHTML = "";
    document.getElementById("year-table").innerHTML = "";
    return;
  }

  last = { a, b, years };
  drawCharts();
  drawTable();
  drawYearTable();
  saveToURL(ids);
}

/**
 * One chart for the selected view. Colour = plan; solid = value, dotted = amount invested.
 */
function drawCharts() {
  if (!last) return;
  const { a, b, years } = last;
  const mode = VIEW_MODES[viewMode];
  const colorA = cssVar("--plan-a");
  const colorB = cssVar("--plan-b");
  const values = (plan, key) => plan.data.map((d) => d[key]);

  drawLineChart(chartEl, {
    years,
    height: 260,
    ariaLabel: `Line chart of ${mode.valueLabel.toLowerCase()} and amount invested for Plan A and Plan B by year`,
    series: [
      { values: values(b, mode.investedKey), color: colorB, dash: "2 4" },
      { values: values(a, mode.investedKey), color: colorA, dash: "2 4" },
      { values: values(b, mode.valueKey), color: colorB },
      { values: values(a, mode.valueKey), color: colorA },
    ],
    tooltip: (yr) => {
      const block = (name, cls, plan) =>
        `<div class="tt-plan"><i class="swatch ${cls}"></i>${name}</div>` +
        tooltipRow(`line style-solid ${cls}`, mode.valueLabel, formatINR(plan.data[yr][mode.valueKey])) +
        tooltipRow(`line style-dotted ${cls}`, "Invested", formatINR(plan.data[yr][mode.investedKey]));
      const gap = b.data[yr][mode.valueKey] - a.data[yr][mode.valueKey];
      return (
        `<div class="tt-title">After ${yr} year${yr === 1 ? "" : "s"}</div>` +
        block("Plan A", "plan-a", a) +
        block("Plan B", "plan-b", b) +
        `<div class="tt-row tt-gap">B − A<b>${formatSigned(gap)}</b></div>`
      );
    },
  });
}

function drawTable() {
  const { a, b, years } = last;
  const ea = a.data[years];
  const eb = b.data[years];
  const mode = VIEW_MODES[viewMode];
  const R = Math.round;

  const rows = [
    // Money rows use whole rupees, so returns and differences add up exactly to the amounts shown
    ["Monthly SIP (year 1)", R(a.P), R(b.P)],
    [`Monthly SIP (year ${years})`, R(ea.payment), R(eb.payment)],
    ["Lump sum", R(a.lumpSum), R(b.lumpSum)],
    [mode.investedLabel, R(ea[mode.investedKey]), R(eb[mode.investedKey])],
    [
      mode.returnsLabel,
      R(ea[mode.valueKey]) - R(ea[mode.investedKey]),
      R(eb[mode.valueKey]) - R(eb[mode.investedKey]),
      false,
      formatINRSigned, // real returns can be negative when returns don't beat inflation
    ],
    [mode.valueLabel, R(ea[mode.valueKey]), R(eb[mode.valueKey]), true],
    [
      mode.gainLabel,
      gainPercent(ea[mode.valueKey], ea[mode.investedKey]),
      gainPercent(eb[mode.valueKey], eb[mode.investedKey]),
      false,
      formatPercent,
      (v) => formatPercent(v).replace("%", " pts"),
    ],
  ];

  const body = document.getElementById("compare-body");

  // Build the rows once; after that, update the cells in place so their numbers count smoothly
  if (body.rows.length !== rows.length) {
    body.innerHTML = "";
    rows.forEach(([, , , key]) => {
      const tr = document.createElement("tr");
      if (key) tr.className = "key";
      const th = document.createElement("th");
      th.scope = "row";
      tr.appendChild(th);
      for (let i = 0; i < 3; i++) tr.appendChild(document.createElement("td"));
      body.appendChild(tr);
    });
  }

  rows.forEach(([label, va, vb, , format = formatINR, diffFormat = formatSigned], r) => {
    const cells = body.rows[r].cells;
    cells[0].textContent = label;
    animateNumber(cells[1], va, format);
    animateNumber(cells[2], vb, format);
    animateNumber(cells[3], vb - va, diffFormat);
  });
}

/**
 * Year-by-year rows for both plans, in whole rupees:
 * year, then monthly SIP, invested so far, value and today's money for A, the same for B, then the value gap.
 */
function yearRows() {
  const R = Math.round;
  const plan = (d) => [R(d.payment), R(d.invested), R(d.value), R(d.real)];
  return last.a.data.slice(1).map((da, idx) => {
    const db = last.b.data[idx + 1];
    return [idx + 1, ...plan(da), ...plan(db), R(db.value) - R(da.value)];
  });
}

function drawYearTable() {
  const body = document.getElementById("year-table");
  body.innerHTML = "";
  yearRows().forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((v, i) => {
      const cell = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) cell.scope = "row";
      cell.textContent = i === 0 ? String(v) : i === row.length - 1 ? formatSigned(v) : formatINR(v);
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
}

function downloadCSV() {
  if (!last) return;
  const cols = ["Monthly SIP", "Invested so far", "Value", "In today's money"];
  const rows = [["Year", ...cols.map((c) => "Plan A " + c), ...cols.map((c) => "Plan B " + c), "Value difference (B - A)"], ...yearRows()];
  const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\r\n");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "sip-comparison-year-by-year.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

loadFromURL(ids);
wireSliders(ids, update);
wireInfoIcons();
wireCopyLink(document.getElementById("copy-link"), () => saveToURL(ids));

document.getElementById("reset").addEventListener("click", () => {
  resetFields(ids);
  update();
});
document.getElementById("download-csv").addEventListener("click", downloadCSV);
animateDetails(document.querySelector(".table-block"));

// Redraw the charts when their width changes
onWidthChange(chartEl, drawCharts);

// The tabs switch the summary and the chart between total value and today's money
wireViewTabs((mode) => {
  viewMode = mode;
  document.getElementById("legend-value").textContent = VIEW_MODES[mode].valueLabel;
  drawCharts();
  if (last) drawTable();
});

initTheme(update); // sets the theme button's label and draws everything
