const planFields = [
  { key: "amount", label: "Monthly Investment (₹)", min: 1000, max: 250000, step: 1000 },
  { key: "lumpsum", label: "Lump Sum (₹)", min: 0, max: 2500000, step: 10000 },
  { key: "stepup", label: "Annual Step-up (%)", min: 0, max: 50, step: 1 },
  { key: "rate", label: "Expected Return (%)", min: 1, max: 30, step: 0.5 },
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
        <input type="number" id="${id}" value="${value}" min="${f.min}" step="${f.step}" />
      </div>
      <input type="range" id="${id}-range" min="${f.min}" max="${f.max}" step="${f.step}" value="${value}"
        aria-label="Plan ${plan.toUpperCase()} ${f.label}" />`;
    box.appendChild(field);
  });
});

const ids = [...["a", "b"].flatMap((p) => planFields.map((f) => `${p}-${f.key}`)), "years", "inflation"];
const valueChartEl = document.getElementById("value-chart");
const realChartEl = document.getElementById("real-chart");

let last = null; // { a, b, years } from the latest calculation

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
    valueChartEl.innerHTML = "";
    realChartEl.innerHTML = "";
    document.getElementById("compare-body").innerHTML = "";
    return;
  }

  last = { a, b, years };
  drawCharts();
  drawTable();
  saveToURL(ids);
}

/**
 * Two charts on the same scale. Colour = plan; in the first chart, dotted = amount invested.
 *   1. Total value (solid) and amount invested (dotted)
 *   2. Total value in today's money
 */
function drawCharts() {
  if (!last) return;
  const { a, b, years } = last;
  const colorA = cssVar("--plan-a");
  const colorB = cssVar("--plan-b");
  const values = (plan, key) => plan.data.map((d) => d[key]);
  const yMax = niceMax(Math.max(a.data[years].value, b.data[years].value));
  const title = (yr) => `<div class="tt-title">After ${yr} year${yr === 1 ? "" : "s"}</div>`;
  const gapRow = (yr, key) =>
    `<div class="tt-row tt-gap">B − A<b>${formatSigned(b.data[yr][key] - a.data[yr][key])}</b></div>`;

  drawLineChart(valueChartEl, {
    years,
    yMax,
    ariaLabel: "Line chart of total value and amount invested for Plan A and Plan B by year",
    series: [
      { values: values(b, "invested"), color: colorB, dash: "2 4" },
      { values: values(a, "invested"), color: colorA, dash: "2 4" },
      { values: values(b, "value"), color: colorB },
      { values: values(a, "value"), color: colorA },
    ],
    tooltip: (yr) => {
      const block = (name, cls, plan) =>
        `<div class="tt-plan"><i class="swatch ${cls}"></i>${name}</div>` +
        tooltipRow(`line style-solid ${cls}`, "Total value", formatINR(plan.data[yr].value)) +
        tooltipRow(`line style-dotted ${cls}`, "Invested", formatINR(plan.data[yr].invested));
      return title(yr) + block("Plan A", "plan-a", a) + block("Plan B", "plan-b", b) + gapRow(yr, "value");
    },
  });

  drawLineChart(realChartEl, {
    years,
    yMax,
    ariaLabel: "Line chart of total value in today's money and amount invested for Plan A and Plan B by year",
    series: [
      { values: values(b, "invested"), color: colorB, dash: "2 4" },
      { values: values(a, "invested"), color: colorA, dash: "2 4" },
      { values: values(b, "real"), color: colorB },
      { values: values(a, "real"), color: colorA },
    ],
    tooltip: (yr) => {
      const block = (name, cls, plan) =>
        `<div class="tt-plan"><i class="swatch ${cls}"></i>${name}</div>` +
        tooltipRow(`line style-solid ${cls}`, "In today's money", formatINR(plan.data[yr].real)) +
        tooltipRow(`line style-dotted ${cls}`, "Invested", formatINR(plan.data[yr].invested));
      return title(yr) + block("Plan A", "plan-a", a) + block("Plan B", "plan-b", b) + gapRow(yr, "real");
    },
  });
}

function drawTable() {
  const { a, b, years } = last;
  const ea = a.data[years];
  const eb = b.data[years];

  const rows = [
    ["Monthly SIP (year 1)", a.P, b.P],
    [`Monthly SIP (year ${years})`, ea.payment, eb.payment],
    ["Lump sum", a.lumpSum, b.lumpSum],
    ["Total invested", ea.invested, eb.invested],
    ["Returns", ea.value - ea.invested, eb.value - eb.invested],
    ["Total value", ea.value, eb.value, true],
    ["In today's money", ea.real, eb.real],
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

  rows.forEach(([label, va, vb], r) => {
    const cells = body.rows[r].cells;
    cells[0].textContent = label;
    animateNumber(cells[1], va, formatINR);
    animateNumber(cells[2], vb, formatINR);
    animateNumber(cells[3], vb - va, formatSigned);
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
onWidthChange(valueChartEl, drawCharts);

initTheme(update); // sets the theme button's label and draws everything
