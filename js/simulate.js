/**
 * Step-up SIP, simulated month by month.
 * - The monthly payment `P` rises at the start of every year, by `stepUp` (e.g. 0.1 = 10%)
 *   and/or by a fixed `stepUpAmount` in rupees.
 * - Each payment is made at the start of the month, then grows at monthly rate `i`.
 * - `inflation` (e.g. 0.06 = 6%) discounts each year's value back to today's money.
 * - `realInvested` is each payment counted at what it was worth in today's money
 *   when it was made, so it can be compared with `real`.
 * Returns one point per year, starting at year 0.
 */
function simulateSIP(P, i, stepUp, inflation, years, stepUpAmount = 0) {
  const points = [{ payment: 0, invested: 0, value: 0, real: 0, realInvested: 0, withdrawn: 0, realWithdrawn: 0 }];
  let invested = 0;
  let realInvested = 0;
  let value = 0;
  let payment = P;
  let monthIndex = 0;

  for (let yr = 1; yr <= years; yr++) {
    for (let month = 0; month < 12; month++) {
      invested += payment;
      realInvested += payment / Math.pow(1 + inflation, monthIndex / 12);
      value = (value + payment) * (1 + i);
      monthIndex++;
    }
    points.push({
      payment,
      invested,
      value,
      real: value / Math.pow(1 + inflation, yr),
      realInvested,
      withdrawn: 0,
      realWithdrawn: 0,
    });
    payment = payment * (1 + stepUp) + stepUpAmount;
  }
  return points;
}

/**
 * Monthly withdrawals (SWP) once investing stops, carrying on from `start` (the last point of simulateSIP)
 * after `startYear` years. The money stays invested at monthly rate `i`: each month it grows,
 * then the withdrawal is taken out, until nothing is left or `maxYears` have passed.
 * The first year's withdrawal is `W` a month; with `rise`, it goes up by `inflation` every year after that.
 * `realWithdrawn` counts each withdrawal at its value in today's money.
 * With `tax` ({ rate, exemption }), each withdrawal is part cost and part gain (average cost: the share of
 * the balance that was put in is not taxed). A year's gains above the exemption are taxed once, at the end
 * of the year, and the tax comes out of the money left (if none is left, it is still counted as owed).
 * Returns { points: one per year of withdrawals, months: withdrawals made, ranOut }.
 */
function simulateSWP(start, W, i, inflation, startYear, maxYears, rise = false, tax = null) {
  const points = [];
  let withdrawal = W;
  let value = start.value;
  let withdrawn = 0;
  let realWithdrawn = 0;
  let months = 0;
  let monthIndex = startYear * 12;
  let ranOut = false;
  let basis = start.invested; // what is still invested, at cost

  for (let yr = 1; yr <= maxYears && !ranOut; yr++) {
    if (yr > 1 && rise) withdrawal *= 1 + inflation;
    let gains = 0;
    for (let month = 0; month < 12; month++) {
      value *= 1 + i;
      const take = Math.min(withdrawal, value);
      const cost = value > 0 ? (basis * take) / value : 0;
      gains += take - cost;
      basis -= cost;
      value -= take;
      monthIndex++;
      withdrawn += take;
      realWithdrawn += take / Math.pow(1 + inflation, monthIndex / 12);
      months++;
      if (value < 0.005) {
        value = 0;
        ranOut = true;
        break;
      }
    }
    let taxThisYear = 0;
    if (tax) {
      taxThisYear = tax.rate * Math.max(0, gains - tax.exemption);
      const pay = Math.min(taxThisYear, value);
      if (value > 0) basis *= 1 - pay / value;
      value -= pay;
      if (value < 0.005 && !ranOut) {
        value = 0;
        ranOut = true;
      }
    }
    points.push({
      payment: 0,
      invested: start.invested,
      realInvested: start.realInvested,
      value,
      real: value / Math.pow(1 + inflation, startYear + yr),
      withdrawn,
      realWithdrawn,
      withdrawal, // monthly withdrawal this year
      taxThisYear,
    });
  }
  return { points, months, ranOut };
}

/**
 * Points where a rising line first reaches a milestone, for markers on a chart.
 * `values` has one number per year; `invested` (same length) is used for the "Doubled" marker (value twice what was put in).
 * Returns up to `max` markers as { x: fractional year, value, label }, most important first
 * (the chart skips any whose label would overlap one drawn before it).
 */
const MILESTONES = [1e5, 5e5, 1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9, 5e9, 1e10, 5e10, 1e11];

function findMilestones(values, invested, max = 3) {
  // First fractional year where f(year) goes from below 0 to 0 or above (straight lines between years)
  const firstCrossing = (f) => {
    for (let k = 1; k < values.length; k++) {
      const a = f(k - 1);
      const b = f(k);
      if (a < 0 && b >= 0) return k - 1 + -a / (b - a);
    }
    return null;
  };
  const at = (x) => {
    const lo = Math.floor(x);
    const hi = Math.min(values.length - 1, lo + 1);
    return values[lo] + (values[hi] - values[lo]) * (x - lo);
  };

  const found = [];
  MILESTONES.forEach((level) => {
    const x = firstCrossing((k) => values[k] - level);
    if (x !== null) found.push({ x, value: level, label: formatINR(level) });
  });
  found.reverse(); // biggest first

  const doubled = firstCrossing((k) => (invested[k] > 0 ? values[k] - 2 * invested[k] : -1));
  if (doubled !== null) found.splice(1, 0, { x: doubled, value: at(doubled), label: "Doubled" });

  return found.slice(0, max);
}
