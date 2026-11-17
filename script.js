const fields = ["amount", "stepup", "rate", "inflation", "years", "startyear", "withdrawal"];

const LTCG = { rate: 0.125, exemption: 125000 }; // equity funds held over a year: 12.5% on gains above ₹1.25 lakh a year
const MAX_WITHDRAWAL_YEARS = 50; // how far ahead withdrawals are followed
const LINE_HEIGHT = { min: 200, max: 420 }; // the line chart fills the room it's given, within these

const lineEl = document.getElementById("line-chart");
const pieEl = document.getElementById("pie-chart");
const pieLegendEl = document.getElementById("pie-legend");

let lastData = null; // most recent yearly series (investing, then any withdrawals), reused on resize or view change
let startYear = new Date().getFullYear(); // the calendar year the first payment is made in
let investYears = 0; // how many of those years are spent investing

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
    withdrawnKey: "withdrawn",
  },
  real: {
    valueKey: "real",
    investedKey: "realInvested",
    valueLabel: "In today's money",
    returnsLabel: "Real returns",
    withdrawnKey: "realWithdrawn",
  },
};

let viewMode = "total";

function drawGrowthChart(data) {
  if (!data) {
    lineEl.innerHTML = "";
    return;
  }
  const mode = VIEW_MODES[viewMode];
  const years = data.length - 1;
  const values = data.map((d) => d[mode.valueKey]);
  const invested = data.map((d) => d[mode.investedKey]);
  const withdrawing = years > investYears;

  // Measure the room for the chart with the old drawing removed, so it can shrink as well as grow
  lineEl.innerHTML = "";
  const height = Math.round(
    Math.min(LINE_HEIGHT.max, Math.max(LINE_HEIGHT.min, lineEl.clientHeight)),
  );

  // What each year added and earned, in the current view
  const withdrawnKey = mode.withdrawnKey;
  const addedIn = (yr) => invested[yr] - invested[yr - 1];
  const withdrawnIn = (yr) =>
    data[yr][withdrawnKey] - data[yr - 1][withdrawnKey];
  const grewIn = (yr) =>
    values[yr] - values[yr - 1] - addedIn(yr) + withdrawnIn(yr);

  // The first year the money grew by more than was put in that year: compounding taking over
  let overtake = null;
  for (let yr = 1; yr <= investYears; yr++) {
    if (grewIn(yr) > addedIn(yr)) {
      overtake = yr;
      break;
    }
  }

  // Markers, most important first (the chart skips any that would overlap)
  const markers = [];
  if (withdrawing && data[years].value === 0)
    markers.push({ x: years, value: 0, label: "Runs out", kind: "end" });
  if (withdrawing)
    markers.push({
      x: investYears,
      value: values[investYears],
      label: formatINR(values[investYears]),
      kind: "peak",
    });
  if (overtake)
    markers.push({
      x: overtake,
      value: values[overtake],
      label: "Growth beats SIP",
      kind: "overtake",
    });
  markers.push(
    ...findMilestones(
      values.slice(0, investYears + 1),
      invested.slice(0, investYears + 1),
    ),
  );

  // Without withdrawals, label where the lines end: the value, what was put in, and the returns between
  const signedCompact = (v) =>
    v < 0 ? "−" + formatINR(-v) : "+" + formatINR(v);
  const ends = withdrawing
    ? null
    : {
        lines: [
          {
            value: values[years],
            text: formatINR(values[years]),
            cls: "chart-end-value",
          },
          {
            value: invested[years],
            text: formatINR(invested[years]),
            cls: "chart-end-invested",
          },
        ],
        gap: [signedCompact(values[years] - invested[years]), "returns"],
      };

  // A year's monthly SIP or withdrawal. In rupees it's the exact amount. In today's money each month's
  // payment is worth a little less than the one before (prices rise monthly, the amount changes yearly),
  // so it's the year's average (scaled by how much that year's payments are worth today), labelled "(avg.)".
  // Scaling rather than dividing by 12 keeps it right in a final year when the money runs out early.
  const real = viewMode === "real";
  const monthlyLabel = (label) => (real ? label + " (avg.)" : label);
  const monthly = (exact, realTotal, rupeeTotal) =>
    formatINR(
      real && rupeeTotal > 0 ? (exact * realTotal) / rupeeTotal : exact,
    );

  const series = [
    { values: invested, color: cssVar("--series-invested") },
    { values, color: cssVar("--series-value"), area: true },
  ];

  drawLineChart(lineEl, {
    years,
    ariaLabel: `Line chart of amount invested and ${mode.valueLabel.toLowerCase()} by year`,
    height,
    markers,
    ends,
    xLabel: (yr) => String(startYear + yr), // the calendar year at the start of that year
    divider: withdrawing
      ? { x: investYears, label: "Withdrawals start" }
      : null,
    series,
    tooltip: (yr) => {
      const d = data[yr];
      const w = yr > investYears;
      const returns = values[yr] + d[withdrawnKey] - invested[yr];
      const notes = markers
        .filter(
          (mk) =>
            mk.kind !== "end" &&
            mk.kind !== "peak" &&
            mk.x > yr - 1 &&
            mk.x <= yr,
        )
        .map((mk) =>
          mk.kind === "overtake"
            ? "Growth beat your SIP for the first time"
            : mk.label === "Doubled"
              ? "Money doubled"
              : "Crossed " + mk.label,
        );
      const muted = "color:var(--muted)";
      return (
        `<div class="tt-title">After ${yr} year${yr === 1 ? "" : "s"} (${yr === 0 ? "start of " + startYear : "end of " + (startYear + yr - 1)})${w ? ", withdrawing" : ""}</div>` +
        tooltipRow("value", mode.valueLabel, formatINR(values[yr])) +
        tooltipRow("invested", "Invested", formatINR(invested[yr])) +
        tooltipRow(
          "",
          "Returns",
          `${formatINRSigned(returns)} (${formatPercent(gainPercent(invested[yr] + returns, invested[yr]))})`,
          muted,
        ) +
        (yr > 0
          ? `<div class="tt-sep"></div>` +
            (w
              ? tooltipRow(
                  "",
                  monthlyLabel("Withdrawing"),
                  monthly(
                    d.withdrawal,
                    withdrawnIn(yr),
                    d.withdrawn - data[yr - 1].withdrawn,
                  ) + "/month",
                  muted,
                ) +
                tooltipRow(
                  "",
                  "Withdrawn so far",
                  formatINR(d[withdrawnKey]),
                  muted,
                )
              : tooltipRow(
                  "",
                  monthlyLabel("Monthly SIP"),
                  monthly(
                    d.payment,
                    addedIn(yr),
                    d.invested - data[yr - 1].invested,
                  ),
                  muted,
                )) +
            tooltipRow("", "Grew this year", formatINRSigned(grewIn(yr)), muted)
          : "") +
        notes
          .map((text) => `<div class="tt-row tt-milestone">${text}</div>`)
          .join("")
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
  pieEnd = end;
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

/**
 * How each result is displayed
 */
const resultFormats = {
  invested: formatINR,
  "final-sip": (v) => formatINR(v) + "/month",
  returns: formatINR,
  total: formatINR,
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
    else setStaticText(node, "-");
  }
}

/**
 * Columns of the year-by-year table and its CSV, in order.
 * Amounts are whole rupees, so each row adds up exactly as shown.
 */
const blankOr = (format) => (v) => (v === null ? "—" : format(v)); // "—" where a column doesn't apply

const TABLE_COLUMNS = [
  { label: "Year", get: (r) => r.year, show: String },
  { label: "Calendar year", get: (r) => r.calendar, show: String },
  { label: "Monthly SIP", get: (r) => r.payment, show: blankOr(formatINR) },
  {
    label: "Invested this year",
    get: (r) => r.investedThisYear,
    show: formatINR,
  },
  { label: "Invested so far", get: (r) => r.invested, show: formatINR },
  {
    label: "Withdrawn this year",
    get: (r) => r.withdrawnThisYear,
    show: blankOr(formatINR),
    withdrawalsOnly: true,
  },
  {
    label: "Tax paid",
    get: (r) => r.taxThisYear,
    show: blankOr(formatINR),
    withdrawalsOnly: true,
    taxOnly: true,
  },
  {
    label: "Returns this year",
    get: (r) => r.returnsThisYear,
    show: formatINRSigned,
  },
  { label: "Returns so far", get: (r) => r.returns, show: formatINRSigned },
  { label: "Value", get: (r) => r.value, show: formatINR },
  {
    label: "Gain",
    get: (r) => r.gain,
    show: formatPercent,
    csv: (v) => v.toFixed(1) + "%",
  },
  { label: "In today's money", get: (r) => r.real, show: formatINR },
  {
    label: "Real gain",
    get: (r) => r.realGain,
    show: formatPercent,
    csv: (v) => v.toFixed(1) + "%",
  },
];

/**
 * One row per year.
 * In withdrawal years, returns and gains count what was taken out as well as what is left.
 */
function tableRows(data) {
  const R = Math.round;
  return data.slice(1).map((d, idx) => {
    const year = idx + 1;
    const withdrawing = year > investYears;
    const prev = data[idx];
    const investedThisYear = R(d.invested) - R(prev.invested);
    const withdrawnThisYear = R(d.withdrawn) - R(prev.withdrawn);
    return {
      year,
      calendar: startYear + year - 1,
      withdrawing,
      payment: withdrawing ? null : R(d.payment),
      investedThisYear,
      invested: R(d.invested),
      withdrawnThisYear: withdrawing ? withdrawnThisYear : null,
      taxThisYear: withdrawing ? Math.round(d.taxThisYear) : null,
      returnsThisYear:
        R(d.value) - R(prev.value) - investedThisYear + withdrawnThisYear,
      returns: R(d.value) + R(d.withdrawn) - R(d.invested),
      value: R(d.value),
      gain: gainPercent(d.value + d.withdrawn, d.invested),
      real: R(d.real),
      realGain: gainPercent(d.real + d.realWithdrawn, d.realInvested),
    };
  });
}

/**
 * The columns to show: the withdrawal column only when there are withdrawals
 */
function tableColumns() {
  const withdrawing = lastData && lastData.length - 1 > investYears;
  const taxed = taxOn();
  return TABLE_COLUMNS.filter(
    (col) => (withdrawing || !col.withdrawalsOnly) && (taxed || !col.taxOnly),
  );
}

function drawTable(data) {
  const body = document.getElementById("year-table");
  const head = document.getElementById("year-head");
  body.innerHTML = "";
  head.innerHTML = "";
  if (!data) return;

  const columns = tableColumns();
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = col.label;
    head.appendChild(th);
  });

  tableRows(data).forEach((row) => {
    const tr = document.createElement("tr");
    if (row.year === investYears + 1) tr.className = "phase-start"; // first year of withdrawals
    columns.forEach((col, i) => {
      const cell = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) cell.scope = "row";
      cell.textContent = col.show(col.get(row));
      tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
}

const taxOn = () => document.getElementById("ltcg").checked;

/**
 * Tax, in its own boxes under Total Value: what selling everything at the end would cost, and,
 * when withdrawals are on, the tax paid over the years (what is still invested is not taxed).
 */
function showTax(end, swp) {
  const on = taxOn() && !!end;
  document.getElementById("tax-box").hidden = !on;
  document.getElementById("tax-swp").hidden = !swp;
  if (!on) return;
  const due = LTCG.rate * Math.max(0, end.value - end.invested - LTCG.exemption);
  animateNumber(document.getElementById("tax-lump-value"), due, formatINR);
  document.getElementById("tax-lump-words").textContent = `${formatINR(end.value - due)} left after tax`;
  if (swp) {
    const paid = swp.points[swp.points.length - 1].taxPaid;
    animateNumber(document.getElementById("tax-swp-value"), paid, formatINR);
    document.getElementById("tax-swp-words").textContent =
      `over ${swp.points.length} years, from the money left`;
  }
}

function calculateSIP() {
  const P = parseFloat(document.getElementById("amount").value);
  const annualRate = parseFloat(document.getElementById("rate").value);
  const years = Math.round(parseFloat(document.getElementById("years").value));
  // Empty optional boxes mean "none"
  const stepUp = readOptional("stepup", 0);
  const inflation = readOptional("inflation", 0);
  const swpOn = document.getElementById("swp-on").checked;
  startYear = Math.round(readOptional("startyear", new Date().getFullYear()));
  const typed = readOptional("withdrawal", 0); // kept (and its note shown) even while withdrawals are off
  const withdrawal = swpOn ? typed : 0;
  document.getElementById("sec-after-box").classList.toggle("is-off", !swpOn);
  document
    .querySelectorAll(
      "#withdrawal, #withdrawal-today, #withdrawal-rise",
    )
    .forEach((node) => (node.disabled = !swpOn));

  if (
    [P, annualRate, years, stepUp, inflation, withdrawal].some(isNaN) ||
    P <= 0 ||
    years <= 0 ||
    annualRate < 0 ||
    stepUp < 0 ||
    inflation < 0 ||
    withdrawal < 0
  ) {
    showResults();
    showWithdrawals(null);
    showTax(null);
    lastData = null;
    drawGrowthChart(null);
    drawPieChart(null);
    drawTable(null);
    return;
  }

  const i = annualRate / 12 / 100;
  const byAmount = stepUpUnit("stepup") === "amount";
  lastData = simulateSIP(
    P,
    i,
    byAmount ? 0 : stepUp / 100,
    inflation / 100,
    years,
    byAmount ? stepUp : 0,
  );
  investYears = years;

  const end = lastData[years];
  // In today's money, the withdrawal is scaled up to what it costs when withdrawals start
  const inToday = document.getElementById("withdrawal-today").checked;
  const rise = document.getElementById("withdrawal-rise").checked;
  const firstWithdrawal = inToday
    ? typed * Math.pow(1 + inflation / 100, years)
    : typed;
  const preview =
    typed > 0
      ? simulateSWP(
          end,
          firstWithdrawal,
          i,
          inflation / 100,
          years,
          MAX_WITHDRAWAL_YEARS,
          rise,
          taxOn() ? LTCG : null,
        )
      : null;
  const swp = swpOn ? preview : null; // off: shown dimmed, but not part of the results
  document.querySelector(".switches").hidden = !(typed > 0); // only relevant with a withdrawal
  if (swp) {
    lastData = lastData.concat(swp.points);
  }
  showWithdrawals(swp);
  showTax(end, swp);
  showWithdrawalNote(preview, typed, inToday, rise, inflation);
  showResults({
    invested: end.invested,
    "final-sip": end.payment,
    returns: end.value - end.invested,
    total: end.value,
    real: end.real,
    gain: gainPercent(end.value, end.invested),
    "real-gain": gainPercent(end.real, end.realInvested),
  });
  drawTable(lastData);
  drawGrowthChart(lastData);
  drawPieChart(end);
  saveToURL(fields);
}

/**
 * A line under the withdrawal box saying what is actually taken out, e.g.
 * "₹1,00,000 today is ₹2,39,656 a month when withdrawals start, rising 6% a year"
 */
function showWithdrawalNote(swp, typed, inToday, rise, inflation) {
  const note = document.getElementById("withdrawal-note");
  note.hidden = !swp || (!inToday && !rise) || inflation === 0;
  if (note.hidden) return;
  const first = swp.points[0].withdrawal;
  const last = swp.points[swp.points.length - 1].withdrawal;
  const start = inToday
    ? `${formatINR(typed)} today is ${formatINR(first)} a month when withdrawals start`
    : `${formatINR(first)} a month to start`;
  const when = swp.ranOut
    ? "in the final year"
    : `after ${swp.points.length} years`;
  note.textContent = rise
    ? `${start}, rising ${inflation}% a year to ${formatINR(last)} ${when}. ` +
      "It's raised once a year, so in today's money it slips slightly between raises."
    : `${start}, the same every year.`;
}

/**
 * The "Withdrawals" results, shown only when a monthly withdrawal is set
 */
function showWithdrawals(swp) {
  const group = document.getElementById("withdraw-group");
  group.hidden = !swp;
  if (!swp) return;
  setStaticText(
    document.getElementById("lasts"),
    swp.ranOut
      ? `${formatDuration(swp.months)} (to ${startYear + investYears + Math.floor((swp.months - 1) / 12)})`
      : `${MAX_WITHDRAWAL_YEARS}+ years`,
  );
  document.querySelector(".withdrawn-label").textContent = swp.ranOut
    ? "Total withdrawn"
    : `Withdrawn in ${MAX_WITHDRAWAL_YEARS} years`;
  animateNumber(
    document.getElementById("withdrawn"),
    swp.points[swp.points.length - 1].withdrawn,
    formatINR,
  );
}

function downloadCSV() {
  if (!lastData) return;
  const columns = tableColumns();
  const rows = [columns.map((col) => col.label)];
  tableRows(lastData).forEach((row) => {
    rows.push(
      columns.map((col) => {
        const v = col.get(row);
        return v === null ? "" : col.csv ? col.csv(v) : v;
      }),
    );
  });
  const csv = rows
    .map((r) => r.map((cell) => `"${cell}"`).join(","))
    .join("\r\n");

  const link = document.createElement("a");
  link.href = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  link.download = "sip-year-by-year.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

const thisYear = new Date().getFullYear();
document.getElementById("startyear").defaultValue = thisYear; // Reset goes back to the current year
document.getElementById("startyear").value = thisYear;
loadFromURL(fields);
wireInputs(fields, calculateSIP);
["swp-on", "withdrawal-today", "withdrawal-rise", "ltcg"].forEach((id) =>
  document.getElementById(id).addEventListener("change", calculateSIP),
);
wireStepUpUnits(
  () => parseFloat(document.getElementById("amount").value) || 0,
  calculateSIP,
);
wireInfoIcons();
wireCopyLink(document.getElementById("copy-link"), () => saveToURL(fields));

document.getElementById("reset").addEventListener("click", () => {
  resetFields(fields);
  calculateSIP();
});
document.getElementById("download-csv").addEventListener("click", downloadCSV);

// Redraw the line chart when its width changes
onWidthChange(lineEl, () => drawGrowthChart(lastData));

// The year-by-year table slides open and closed
animateDetails(document.querySelector(".table-block"));

// Tabs at the top of the charts switch both charts between total value and today's money
wireViewTabs((mode) => {
  viewMode = mode;
  document.getElementById("legend-value").textContent =
    VIEW_MODES[mode].valueLabel;
  drawGrowthChart(lastData);
  drawPieChart(pieEnd);
});

calculateSIP(); // first drawing
