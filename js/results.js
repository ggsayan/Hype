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
