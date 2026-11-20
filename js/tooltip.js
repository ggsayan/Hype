function showTooltip(html, x, y) {
  const tooltip = document.getElementById("tooltip");
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  const pad = 12;
  const w = tooltip.offsetWidth;
  const h = tooltip.offsetHeight;
  let left = x + 16;
  let top = y - h - 12;
  if (left + w > window.innerWidth - pad) left = x - w - 16;
  if (top < pad) top = y + 16;
  tooltip.style.left = Math.max(pad, left) + "px";
  tooltip.style.top = top + "px";
}

function hideTooltip() {
  document.getElementById("tooltip").classList.remove("show");
}

/**
 * `swatch` is a class like "value" or "invested"; `style` is optional inline CSS for the row
 */
function tooltipRow(swatch, label, value, style = "") {
  return `<div class="tt-row" style="${style}"><i class="swatch ${swatch}"></i>${label}<b>${value}</b></div>`;
}

/**
 * Info icons: show their explanation on hover, keyboard focus or tap
 */
function wireInfoIcons() {
  document.querySelectorAll(".info").forEach((btn) => {
    const show = () => {
      const r = btn.getBoundingClientRect();
      const text = document.createElement("div");
      text.className = "tt-text";
      text.textContent = btn.dataset.info;
      showTooltip(text.outerHTML, r.right - 8, r.top);
    };
    btn.addEventListener("mouseenter", show);
    btn.addEventListener("focus", show);
    btn.addEventListener("click", show);
    btn.addEventListener("mouseleave", hideTooltip);
    btn.addEventListener("blur", hideTooltip);
  });

  // Hide an info tooltip when tapping anywhere else (touch screens)
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".info")) hideTooltip();
  });
}
