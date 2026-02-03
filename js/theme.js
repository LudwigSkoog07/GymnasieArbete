(() => {
  const STORAGE_KEY = "theme-preference";
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const getStoredPreference = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch {
      return "system";
    }
  };

  const resolveTheme = (pref) => {
    if (pref === "light" || pref === "dark") return pref;
    return media.matches ? "dark" : "light";
  };

  const applyTheme = (pref) => {
    const resolved = resolveTheme(pref);
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themePref = pref;
  };

  const setPreference = (pref) => {
    const value = ["light", "dark", "system"].includes(pref) ? pref : "system";
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {}
    applyTheme(value);
  };

  const getPreference = () => getStoredPreference();

  applyTheme(getStoredPreference());

  const onSystemChange = () => {
    if (getStoredPreference() === "system") applyTheme("system");
  };

  if (media.addEventListener) {
    media.addEventListener("change", onSystemChange);
  } else if (media.addListener) {
    media.addListener(onSystemChange);
  }

  window.theme = { getPreference, setPreference, applyTheme };
})();
