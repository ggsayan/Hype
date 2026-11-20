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
