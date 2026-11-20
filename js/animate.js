const NUMBER_ANIM_MS = 450;
const CHART_ANIM_MS = 400;
const REVEAL_MS = 900; // line charts drawing in on first load
const PANEL_MS = 280; // table opening / closing

function reduceMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Stretch or squeeze a list of yearly values to `len` points (used when the time period changes)
 */
function resample(values, len) {
  if (values.length === len) return values;
  const out = [];
  for (let i = 0; i < len; i++) {
    const pos = (i * (values.length - 1)) / (len - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(values.length - 1, lo + 1);
    out.push(values[lo] + (values[hi] - values[lo]) * (pos - lo));
  }
  return out;
}

/**
 * Count an element's number smoothly from what it shows now to `target`, displayed with `format`
 */
function animateNumber(node, target, format) {
  cancelAnimationFrame(node._anim);
  const from = node._shown;
  if (
    typeof from !== "number" ||
    reduceMotion() ||
    Math.abs(from - target) < 0.5
  ) {
    node._shown = target;
    node.textContent = format(target);
    return;
  }
  let start = null; // timed from the first frame, so progress never runs backwards
  const step = (now) => {
    if (start === null) start = now;
    const t = easeOutCubic(Math.min(1, (now - start) / NUMBER_ANIM_MS));
    node._shown = from + (target - from) * t;
    node.textContent = format(node._shown);
    if (t < 1) node._anim = requestAnimationFrame(step);
  };
  node._anim = requestAnimationFrame(step);
}

/**
 * Show plain text (e.g. "-") and stop any running count
 */
function setStaticText(node, text) {
  cancelAnimationFrame(node._anim);
  node._shown = null;
  node.textContent = text;
}

/**
 * Smoothly open and close a <details> element. Its content must be wrapped in `.details-body`.
 */
function animateDetails(details) {
  const body = details.querySelector(".details-body");
  details.querySelector("summary").addEventListener("click", (e) => {
    if (reduceMotion() || !body.animate) return; // fall back to the instant toggle
    e.preventDefault();
    if (details._anim) return; // ignore clicks while it's moving

    const easing = "cubic-bezier(0.2, 0.7, 0.3, 1)";
    if (!details.open) {
      details.open = true;
      const h = body.scrollHeight;
      details._anim = body.animate(
        [
          { height: "0px", opacity: 0 },
          { height: h + "px", opacity: 1 },
        ],
        { duration: PANEL_MS, easing },
      );
      details._anim.onfinish = () => (details._anim = null);
    } else {
      const h = body.offsetHeight;
      details._anim = body.animate(
        [
          { height: h + "px", opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: PANEL_MS * 0.85, easing: "ease-in" },
      );
      details._anim.onfinish = () => {
        details.open = false;
        details._anim = null;
      };
    }
  });
}
