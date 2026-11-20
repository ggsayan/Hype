const lineEl = document.getElementById("line-chart");

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
