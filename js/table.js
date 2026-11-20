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
