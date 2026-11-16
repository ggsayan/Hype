const planFields = [
  { key: "amount", label: "Monthly Investment (₹)", min: 1000, max: 500000, step: 1000 },
  { key: "lumpsum", label: "Lump Sum (₹)", min: 0, max: 10000000, step: 10000 },
  { key: "stepup", label: "Annual Step-up (%)", min: 0, max: 25, step: 1 },
  { key: "rate", label: "Expected Return (%)", min: 0, max: 25, step: 0.5 },
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
 * The two views, chosen with the tabs at the top of the results.
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
    return;
  }

  last = { a, b, years };
  drawCharts();
  drawTable();
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
    height: 300,
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

loadFromURL(ids);
wireSliders(ids, update);
wireInfoIcons();
wireCopyLink(document.getElementById("copy-link"), () => saveToURL(ids));

document.getElementById("reset").addEventListener("click", () => {
  resetFields(ids);
  update();
});

// Redraw the charts when their width changes
onWidthChange(chartEl, drawCharts);

// Tabs at the top switch the chart and the table between total value and today's money
wireViewTabs((mode) => {
  viewMode = mode;
  document.getElementById("legend-value").textContent = VIEW_MODES[mode].valueLabel;
  drawCharts();
  if (last) drawTable();
});

initTheme(update); // sets the theme button's label and draws everything
