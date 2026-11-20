const fields = [
  "amount",
  "stepup",
  "rate",
  "inflation",
  "years",
  "startyear",
  "withdrawal",
];

const LTCG = { rate: 0.125, exemption: 125000 }; // equity funds held over a year: 12.5% on gains above ₹1.25 lakh a year
const MAX_WITHDRAWAL_YEARS = 50; // how far ahead withdrawals are followed
const CHART_CAP = 1e11; // the growth chart's y axis tops out at ₹10,000Cr; anything higher runs off the top
const LINE_HEIGHT = { min: 200, max: 420 }; // the line chart fills the room it's given, within these

const lineEl = document.getElementById("line-chart");
const pieEl = document.getElementById("pie-chart");
const pieLegendEl = document.getElementById("pie-legend");

let lastData = null; // most recent yearly series (investing, then any withdrawals), reused on resize or view change
let startYear = new Date().getFullYear() + 1; // the calendar year the first payment is made in
let investYears = 0; // how many of those years are spent investing
let inflationPct = 0; // yearly inflation, in percent

/**
 * The two views, chosen with the tabs at the top of the results; they change every amount, both charts and the table.
 * Adjusted for inflation, every payment is counted at its value at today's prices when it was made,
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
    valueLabel: "Inflation-adjusted",
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
    yCap: CHART_CAP,
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

/**
 * How each result is displayed
 */
const resultFormats = {
  invested: formatINR,
  "final-sip": (v) => formatINR(v) + "/mo",
  returns: formatINR,
  total: formatINR,
  gain: formatPercent,
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
];

/**
 * One row per year.
 * In withdrawal years, returns and gains count what was taken out as well as what is left.
 */
function tableRows(data) {
  const R = Math.round;
  const real = viewMode === "real";
  const mode = VIEW_MODES[viewMode];
  const inv = (d) => R(d[mode.investedKey]);
  const wd = (d) => R(d[mode.withdrawnKey]);
  const val = (d) => R(d[mode.valueKey]);
  return data.slice(1).map((d, idx) => {
    const year = idx + 1;
    const withdrawing = year > investYears;
    const prev = data[idx];
    const investedThisYear = inv(d) - inv(prev);
    const withdrawnThisYear = wd(d) - wd(prev);
    // Adjusted for inflation, the monthly SIP is the year's average, as in the chart tooltip
    const added = d.invested - prev.invested;
    const payment =
      real && added > 0
        ? (d.payment * (d.realInvested - prev.realInvested)) / added
        : d.payment;
    const tax = real
      ? d.taxThisYear / Math.pow(1 + inflationPct / 100, investYears + year)
      : d.taxThisYear;
    return {
      year,
      calendar: startYear + year - 1,
      withdrawing,
      payment: withdrawing ? null : R(payment),
      investedThisYear,
      invested: inv(d),
      withdrawnThisYear: withdrawing ? withdrawnThisYear : null,
      taxThisYear: withdrawing ? R(tax) : null,
      returnsThisYear:
        val(d) - val(prev) - investedThisYear + withdrawnThisYear,
      returns: val(d) + wd(d) - inv(d),
      value: val(d),
      gain: gainPercent(
        d[mode.valueKey] + d[mode.withdrawnKey],
        d[mode.investedKey],
      ),
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
  // Tax is worked out in rupees of the day it is paid; adjusted for inflation, it is shown at today's prices
  const growth = 1 + inflationPct / 100;
  const real = viewMode === "real";
  const due =
    LTCG.rate * Math.max(0, end.value - end.invested - LTCG.exemption);
  const scale = real ? Math.pow(growth, investYears) : 1;
  animateNumber(
    document.getElementById("tax-lump-value"),
    due / scale,
    formatINR,
  );
  if (swp) {
    const paid = swp.points.reduce(
      (sum, p, k) =>
        sum +
        (real
          ? p.taxThisYear / Math.pow(growth, investYears + k + 1)
          : p.taxThisYear),
      0,
    );
    animateNumber(document.getElementById("tax-swp-value"), paid, formatINR);
  }
}

function calculateSIP() {
  const P = parseFloat(document.getElementById("amount").value);
  const annualRate = parseFloat(document.getElementById("rate").value);
  const years = Math.round(parseFloat(document.getElementById("years").value));
  // Empty optional boxes mean "none"
  const stepUp = readOptional("stepup", 0);
  const inflation = readOptional("inflation", 0);
  inflationPct = inflation;
  const swpOn = document.getElementById("swp-on").checked;
  startYear = Math.round(readOptional("startyear", new Date().getFullYear() + 1));
  const typed = readOptional("withdrawal", 0); // kept (and its note shown) even while withdrawals are off
  const withdrawal = swpOn ? typed : 0;
  document.getElementById("sec-after-box").classList.toggle("is-off", !swpOn);
  document
    .querySelectorAll("#withdrawal, #withdrawal-today, #withdrawal-rise")
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
  showView();
  showWithdrawals(swp);
  showTax(end, swp);
  showWithdrawalNote(preview, typed, inToday, rise, inflation);
  const mode = VIEW_MODES[viewMode];
  const prevYear = lastData[years - 1];
  const addedLastYear = end.invested - prevYear.invested;
  showResults({
    invested: end[mode.investedKey],
    "final-sip":
      viewMode === "real" && addedLastYear > 0
        ? (end.payment * (end.realInvested - prevYear.realInvested)) /
          addedLastYear
        : end.payment,
    returns: end[mode.valueKey] - end[mode.investedKey],
    total: end[mode.valueKey],
    gain: gainPercent(end[mode.valueKey], end[mode.investedKey]),
  });
  drawTable(lastData);
  drawGrowthChart(lastData);
  drawPieChart(end);
  saveToURL(fields);
}

/**
 * Labels that depend on the view: the headline and the table title
 */
function showView() {
  const real = viewMode === "real";
  document.getElementById("total-label").textContent = real
    ? "Total Value (inflation-adjusted)"
    : "Total Value";
  document.querySelector(".final-sip-label").textContent = real
    ? "Final SIP (avg.)"
    : "Final SIP";
  document.getElementById("table-title").textContent = real
    ? "Year-by-year breakdown (inflation-adjusted)"
    : "Year-by-year breakdown";
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

// Full years of withdrawals before the money runs out, e.g. "47 years"
const lastsYears = (months) => {
  const y = Math.floor(months / 12);
  return y < 1 ? "<1 year" : `${y} year${y === 1 ? "" : "s"}`;
};

/**
 * The "Withdrawals" results, shown only when a monthly withdrawal is set
 */
function showWithdrawals(swp) {
  const group = document.getElementById("withdraw-group");
  group.hidden = !swp;
  if (!swp) return;
  // The calendar year it runs out in sits beside the years, smaller, so the column stays one line
  const lasts = document.getElementById("lasts");
  setStaticText(lasts, swp.ranOut ? lastsYears(swp.months) : `${MAX_WITHDRAWAL_YEARS}+ years`);
  if (swp.ranOut) {
    const year = document.createElement("small");
    year.className = "lasts-year";
    year.textContent = startYear + investYears + Math.floor((swp.months - 1) / 12);
    lasts.append(year);
  }
  animateNumber(
    document.getElementById("withdrawn"),
    swp.points[swp.points.length - 1][VIEW_MODES[viewMode].withdrawnKey],
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

const nextYear = new Date().getFullYear() + 1;
document.getElementById("startyear").defaultValue = nextYear; // Reset goes back to next year
document.getElementById("startyear").value = nextYear;
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

// Tabs at the top of the results switch every amount, both charts and the table between actual and inflation-adjusted
wireViewTabs((mode) => {
  viewMode = mode;
  document.getElementById("legend-value").textContent =
    VIEW_MODES[mode].valueLabel;
  calculateSIP();
});

calculateSIP(); // first drawing
