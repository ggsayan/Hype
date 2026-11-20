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
