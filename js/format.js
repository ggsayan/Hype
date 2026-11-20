/**
 * Rupees as an approximation: ₹850, ₹23.58K (thousand), ₹4.5L (lakh), ₹1.25Cr (crore)
 */
function formatINR(value) {
  // Fewer decimals as the number grows, so every amount stays short: ₹1.53L, ₹156.9Cr, ₹13,365Cr
  const places = (n) => (n >= 1000 ? 0 : n >= 100 ? 1 : 2);
  const round = (n) => parseFloat(n.toFixed(places(n)));
  const short = (n) => round(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const units = [
    [1e12, "L Cr"],
    [1e7, "Cr"],
    [1e5, "L"],
    [1e3, "K"],
  ];
  for (let k = 0; k < units.length; k++) {
    const [size, suffix] = units[k];
    if (value < size) continue;
    // Rounding can reach the next unit up (₹99.999L is ₹1Cr, not ₹100L)
    if (k > 0 && round(value / size) >= units[k - 1][0] / size) {
      return "₹" + short(value / units[k - 1][0]) + units[k - 1][1];
    }
    return "₹" + short(value / size) + suffix;
  }
  return Math.round(value) >= 1000 ? "₹1K" : "₹" + Math.round(value);
}

/**
 * "₹1.2K" or "−₹1.2K"
 */
function formatINRSigned(v) {
  return v < -0.5 ? "−" + formatINR(-v) : formatINR(Math.max(0, v));
}

/**
 * Percentage with a sign: "+76.4%", "−3.2%"
 */
function formatPercent(value) {
  const r = Math.round(value * 10) / 10;
  // Past 1,000% the decimal adds nothing
  const n = Math.abs(r) >= 1000 ? Math.round(Math.abs(r)).toLocaleString("en-IN") : Math.abs(r).toFixed(1);
  return (r > 0 ? "+" : r < 0 ? "−" : "") + n + "%";
}

/**
 * Gain as a percentage of what was put in (0 when nothing was put in)
 */
function gainPercent(value, invested) {
  return invested > 0 ? ((value - invested) / invested) * 100 : 0;
}
