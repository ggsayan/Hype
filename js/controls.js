/**
 * Read an optional number box; empty means `fallback`
 */
function readOptional(id, fallback) {
  const raw = document.getElementById(id).value;
  return raw === "" ? fallback : parseFloat(raw);
}

/**
 * The "Actual amounts / Adjusted for inflation" tabs in `.view-bar`.
 * Calls `onChange(mode)` with "total" or "real" when the selected tab changes.
 * Arrow keys move between tabs, as is usual for tab controls.
 */
function wireViewTabs(onChange) {
  const tabs = [...document.querySelectorAll('.view-bar [role="tab"]')];

  const select = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    });
    if (focus) tab.focus();
    onChange(tab.dataset.mode);
  };

  tabs.forEach((tab, idx) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tabs[(idx + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next, true);
    });
  });
}

/**
 * Keep `value` within a number box's min and max (as text, "" left alone)
 */
function clampToLimits(input, value) {
  if (value === "" || isNaN(parseFloat(value))) return value;
  let v = parseFloat(value);
  if (input.max !== "") v = Math.min(v, parseFloat(input.max));
  if (input.min !== "") v = Math.max(v, parseFloat(input.min));
  return String(v);
}

/**
 * Wire each number box (#id): call onChange on every edit and keep it within its limits.
 * A value above the box's max snaps down straight away; one below its min is corrected when
 * you leave the box, so you can still type e.g. "5000" one digit at a time.
 */
function wireInputs(ids, onChange) {
  ids.forEach((id) => {
    const number = document.getElementById(id);

    number.addEventListener("input", () => {
      if (number.max !== "" && parseFloat(number.value) > parseFloat(number.max)) number.value = number.max;
      onChange();
    });

    // Scrolling over the box nudges the value by one step (up for scroll up), within its limits
    number.addEventListener(
      "wheel",
      (event) => {
        if (number.disabled || event.deltaY === 0) return;
        event.preventDefault();
        const step = parseFloat(number.step) || 1;
        const current = parseFloat(number.value);
        let next = (isNaN(current) ? parseFloat(number.min) || 0 : current) + (event.deltaY < 0 ? step : -step);
        next = Math.round(next / step) * step; // no drift from decimal steps like 0.5
        number.value = clampToLimits(number, String(parseFloat(next.toFixed(6))));
        number.dispatchEvent(new Event("input", { bubbles: true }));
      },
      { passive: false },
    );

    number.addEventListener("change", () => {
      const fixed = clampToLimits(number, number.value);
      if (fixed === number.value) return;
      number.value = fixed;
      onChange();
    });
  });
}

/**
 * Step-up can be a percentage or a fixed amount in rupees. A `.unit-toggle[data-unit-for="<id>"]`
 * switches the box #<id> between the two, with these limits.
 */
const STEP_UP_UNITS = {
  percent: { min: 0, max: 25, step: 1 },
  amount: { min: 0, max: 50000, step: 500 },
};

function stepUpUnit(id) {
  const toggle = document.querySelector(`.unit-toggle[data-unit-for="${id}"]`);
  return toggle ? toggle.dataset.unit : "percent";
}

/**
 * Switch #<id> to `unit`. With `base` (the monthly amount), the current value is converted
 * so the step-up stays about the same, e.g. 10% of ₹10,000 becomes ₹1,000.
 */
function setStepUpUnit(id, unit, base) {
  const toggle = document.querySelector(`.unit-toggle[data-unit-for="${id}"]`);
  if (!toggle) return;
  const from = toggle.dataset.unit;
  toggle.dataset.unit = unit;
  toggle.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.unit === unit));

  const limits = STEP_UP_UNITS[unit];
  const number = document.getElementById(id);
  number.min = limits.min;
  number.max = limits.max;
  number.step = limits.step;
  number.setAttribute("aria-label", unit === "amount" ? "Step-up in rupees" : "Step-up in percent");

  if (base !== undefined && from !== unit && number.value !== "") {
    const v = parseFloat(number.value);
    const converted = unit === "amount" ? (base * v) / 100 : base > 0 ? (v / base) * 100 : 0;
    const snapped = Math.round(converted / limits.step) * limits.step;
    number.value = Math.min(limits.max, Math.max(limits.min, snapped));
  }
}

/**
 * Wire every unit toggle on the page. `baseOf(id)` gives the monthly amount used to convert values.
 */
function wireStepUpUnits(baseOf, onChange) {
  document.querySelectorAll(".unit-toggle").forEach((toggle) => {
    const id = toggle.dataset.unitFor;
    toggle.querySelectorAll("button").forEach((btn) =>
      btn.addEventListener("click", () => {
        if (btn.dataset.unit === toggle.dataset.unit) return;
        setStepUpUnit(id, btn.dataset.unit, baseOf(id));
        onChange();
      }),
    );
  });
}

/**
 * Put every box back to the value written in the HTML
 */
function resetFields(ids) {
  document.querySelectorAll(".unit-toggle").forEach((t) => setStepUpUnit(t.dataset.unitFor, "percent"));
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => (box.checked = box.defaultChecked));
  ids.forEach((id) => {
    const number = document.getElementById(id);
    number.value = number.defaultValue;
  });
}

function saveToURL(ids) {
  const params = new URLSearchParams();
  ids.forEach((id) => params.set(id, document.getElementById(id).value));
  document.querySelectorAll(".unit-toggle").forEach((t) => {
    if (t.dataset.unit === "amount") params.set(t.dataset.unitFor + "-unit", "amount");
  });
  // Switches are only written when they differ from their default
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => {
    if (box.checked !== box.defaultChecked) params.set(box.id, box.checked ? "1" : "0");
  });
  try {
    history.replaceState(null, "", "?" + params.toString());
  } catch {
    // Some browsers block this for local files; the page still works
  }
}

/**
 * Run before wireInputs so the boxes start from the loaded values
 */
function loadFromURL(ids) {
  const params = new URLSearchParams(location.search);
  // Units first, so values are checked against the right limits
  document.querySelectorAll(".unit-toggle").forEach((t) => {
    if (params.get(t.dataset.unitFor + "-unit") === "amount") setStepUpUnit(t.dataset.unitFor, "amount");
  });
  document.querySelectorAll('input[type="checkbox"][data-url]').forEach((box) => {
    const value = params.get(box.id);
    if (value === "1" || value === "0") box.checked = value === "1";
  });
  ids.forEach((id) => {
    const value = params.get(id);
    if (value !== null && value !== "" && !isNaN(parseFloat(value))) {
      const input = document.getElementById(id);
      input.value = clampToLimits(input, value); // links can't go past the limits either
    }
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the clipboard API (e.g. some local files)
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function wireCopyLink(btn, beforeCopy) {
  const original = btn.textContent;
  btn.addEventListener("click", async () => {
    beforeCopy();
    const ok = await copyText(location.href);
    btn.textContent = ok ? "Copied!" : "Couldn't copy";
    clearTimeout(btn._timer);
    btn._timer = setTimeout(() => (btn.textContent = original), 1600);
  });
}
