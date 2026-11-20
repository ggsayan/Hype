# Hype

A realistic calculator for SIPs (Systematic Investment Plans), for seeing what a monthly investment could grow into, and how long withdrawals from it could last.

## Files

Plain HTML, CSS and JavaScript, with no build step: open `index.html` to run it.

**`js/`** (loaded in this order by `index.html`)

| File | What it does |
| --- | --- |
| `format.js` | Rupee amounts as K / L / Cr, percentages |
| `simulate.js` | The maths: SIP growth month by month, withdrawals (SWP) with optional LTCG tax, chart milestones |
| `dom.js` | Small helpers for creating elements and reading CSS colours |
| `animate.js` | Easing, counting numbers, the table's slide open and closed |
| `tooltip.js` | The hover tooltip and the info (i) pop-ups |
| `line-chart.js` | A general line chart (axes, markers, hover) used by the growth chart |
| `controls.js` | Number boxes, the step-up % / ₹ switch, the view tabs, saving to the link, Copy link |
| `state.js` | Settings (tax rate, limits) and the current calculation shared by the files below |
| `growth-chart.js` | The "Growth over time" chart |
| `pie-chart.js` | The "Breakdown" donut chart |
| `results.js` | The numbers in the results card: totals, tax, withdrawals |
| `table.js` | The year-by-year table and its CSV download |
| `main.js` | Runs the calculation on every change and wires everything up |

**`css/`**

| File | What it styles |
| --- | --- |
| `base.css` | Colours, fonts, cards, buttons, tooltip, entrance animation |
| `layout.css` | Page layout and the navbar |
| `inputs.css` | The inputs card: number boxes, sections, switches |
| `results.css` | The results card and view tabs |
| `charts.css` | Both charts and their legends |
| `table.css` | The year-by-year table |
