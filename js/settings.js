const radios = document.querySelectorAll('input[name="theme"]');
const statusEl = document.getElementById("themeStatus");

function labelFor(value) {
  if (value === "light") return "Ljust";
  if (value === "dark") return "MÃ¶rkt";
  return "System";
}

function syncUI() {
  const current = window.theme?.getPreference?.() || "system";
  radios.forEach((r) => {
    r.checked = r.value === current;
  });
  if (statusEl) statusEl.textContent = `Aktivt: ${labelFor(current)}`;
}

radios.forEach((radio) => {
  radio.addEventListener("change", () => {
    window.theme?.setPreference?.(radio.value);
    if (statusEl) statusEl.textContent = `Aktivt: ${labelFor(radio.value)}`;
  });
});

syncUI();
