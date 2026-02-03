// ../js/osmAutocomplete.js
// Gratis adress-autocomplete via OpenStreetMap Nominatim
// Användning: initOSMAutocomplete({ inputId, latId, lonId })

export function initOSMAutocomplete({ inputId, latId, lonId }) {
  const input = document.getElementById(inputId);
  if (!input) return;

  const field = input.closest(".field") || input.parentElement;
  if (field && getComputedStyle(field).position === "static") {
    field.style.position = "relative";
  }

  const latInput = ensureHiddenInput(latId, input, field);
  const lonInput = ensureHiddenInput(lonId, input, field);

  const list = document.createElement("div");
  list.className = "autocomplete-list";
  list.setAttribute("role", "listbox");
  list.hidden = true;
  field?.appendChild(list);

  let debounceTimer = null;
  let activeIndex = -1;
  let results = [];
  let controller = null;
  let suppressInput = false;

  function ensureHiddenInput(id, anchor, container) {
    if (!id) return null;
    let el = document.getElementById(id);
    if (el) return el;

    el = document.createElement("input");
    el.type = "hidden";
    el.id = id;
    el.name = id;

    if (anchor?.parentElement) {
      anchor.insertAdjacentElement("afterend", el);
    } else if (container) {
      container.appendChild(el);
    } else {
      document.body.appendChild(el);
    }

    return el;
  }

  function clearCoords() {
    if (latInput) latInput.value = "";
    if (lonInput) lonInput.value = "";
  }

  function openList() {
    positionList();
    list.hidden = false;
  }

  function closeList() {
    list.hidden = true;
    list.innerHTML = "";
    activeIndex = -1;
    results = [];
  }

  function setActive(index) {
    const items = Array.from(list.querySelectorAll(".autocomplete-item"));
    items.forEach((el) => {
      el.classList.remove("is-active");
      if (el.getAttribute("role") === "option") el.setAttribute("aria-selected", "false");
    });

    if (index < 0 || index >= items.length) {
      activeIndex = -1;
      return;
    }

    activeIndex = index;
    const item = items[index];
    item.classList.add("is-active");
    if (item.getAttribute("role") === "option") item.setAttribute("aria-selected", "true");
    item.scrollIntoView({ block: "nearest" });
  }

  function selectIndex(index) {
    const item = results[index];
    if (!item) return;

    suppressInput = true;
    input.value = item.display_name || "";
    if (latInput) latInput.value = item.lat || "";
    if (lonInput) lonInput.value = item.lon || "";
    closeList();
    input.dispatchEvent(new CustomEvent("osm:select", { detail: item }));
    window.setTimeout(() => { suppressInput = false; }, 0);
  }

  function renderResults(listData) {
    list.innerHTML = "";

    if (!listData.length) {
      const empty = document.createElement("div");
      empty.className = "autocomplete-item";
      empty.textContent = "Inga träffar";
      empty.setAttribute("aria-disabled", "true");
      list.appendChild(empty);
      openList();
      return;
    }

    listData.forEach((item, idx) => {
      const label = formatSuggestionLabel(item);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "autocomplete-item";
      btn.textContent = label;
      if (item.display_name) btn.title = item.display_name;
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", "false");
      btn.dataset.index = String(idx);
      btn.addEventListener("click", () => selectIndex(idx));
      list.appendChild(btn);
    });

    openList();
    setActive(-1);
  }

  function normalizeCounty(value) {
    return String(value || "")
      .replace(/\s+län$/i, "")
      .replace(/\s+county$/i, "")
      .trim();
  }

  function formatSuggestionLabel(item) {
    const addr = item?.address || {};

    const road = addr.road || addr.pedestrian || addr.footway || "";
    const house = addr.house_number || "";
    const primaryFromRoad = [road, house].filter(Boolean).join(" ").trim();

    const locality =
      addr.municipality ||
      addr.city ||
      addr.town ||
      addr.village ||
      addr.hamlet ||
      addr.suburb ||
      "";

    const county = normalizeCounty(addr.county);
    const state = addr.state || "";

    let primary =
      primaryFromRoad ||
      addr.neighbourhood ||
      locality ||
      county ||
      state ||
      "";

    if (!primary && item?.display_name) {
      primary = item.display_name.split(",")[0].trim();
    }

    let secondary = "";
    if (primaryFromRoad) {
      secondary = locality || county || state;
    } else if (locality && locality !== primary) {
      secondary = locality;
    } else if (county && county !== primary) {
      secondary = county;
    } else if (state && state !== primary) {
      secondary = state;
    }

    return [primary, secondary].filter(Boolean).join(", ") || (item.display_name || "");
  }

  async function fetchSuggestions(query) {
    if (controller) controller.abort();
    controller = new AbortController();

    async function doFetch(q) {
      const url =
        "https://nominatim.openstreetmap.org/search" +
        `?format=json&q=${encodeURIComponent(q)}` +
        "&addressdetails=1&limit=6&countrycodes=se";

      const headers = {
        Accept: "application/json",
        // OBS: Browsers blockerar custom User-Agent. Denna används i miljöer där det tillåts.
        "User-Agent": "HoganasEvents/1.0 (contact: example@example.com)",
      };

      try {
        const res = await fetch(url, { signal: controller.signal, headers });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data.slice(0, 6) : [];
      } catch {
        return [];
      }
    }

    const primary = await doFetch(query);
    if (primary.length) return primary;

    const fallback = simplifyQuery(query);
    if (fallback && fallback !== query) {
      const secondary = await doFetch(fallback);
      if (secondary.length) return secondary;
    }

    return [];
  }

  function simplifyQuery(query) {
    const q = String(query || "").trim();
    if (!q) return "";

    // Ta bort postnummer och husnummer (t.ex. "6", "6A", "24462")
    const noNumbers = q.replace(/\b\d+[a-z]?\b/gi, "").replace(/\s{2,}/g, " ").trim();

    // Om det finns kommatecken, testa första två delarna (ofta gata + ort)
    const parts = noNumbers.split(",").map((p) => p.trim()).filter(Boolean);
    const sliced = parts.slice(0, 2).join(", ");

    return sliced || noNumbers || q;
  }

  function scheduleSearch() {
    if (debounceTimer) window.clearTimeout(debounceTimer);

    const query = input.value.trim();
    if (query.length < 3) {
      closeList();
      return;
    }

    debounceTimer = window.setTimeout(async () => {
      const listData = await fetchSuggestions(query);
      if (input.value.trim() !== query) return;
      results = listData;
      renderResults(listData);
    }, 300);
  }

  function positionList() {
    if (!field) return;
    const top = input.offsetTop + input.offsetHeight + 6;
    const left = input.offsetLeft;
    list.style.top = `${top}px`;
    list.style.left = `${left}px`;
    list.style.right = "auto";
    list.style.width = `${input.offsetWidth}px`;
  }

  input.addEventListener("input", () => {
    if (suppressInput) return;
    clearCoords();
    scheduleSearch();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeList();
      return;
    }

    if (list.hidden || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = activeIndex + 1 >= results.length ? 0 : activeIndex + 1;
      setActive(next);
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = activeIndex - 1 < 0 ? results.length - 1 : activeIndex - 1;
      setActive(prev);
    }

    if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectIndex(activeIndex);
    }
  });

  document.addEventListener("click", (e) => {
    if (field && !field.contains(e.target)) closeList();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeList();
  });

  window.addEventListener("resize", () => {
    if (!list.hidden) positionList();
  });
}
