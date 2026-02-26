// ../js/events.js
import { supabase } from "./supabaseClient.js";

/* =========================
   DOM
========================= */
const grid = document.getElementById("eventsGrid");
const empty = document.getElementById("eventsEmpty");
const countEl = document.getElementById("eventsCount");
const feedTitleEl = document.getElementById("feedTitle");
const policeToggleEl = document.getElementById("policeToggle");
const filterPillsEl = document.getElementById("filterPills");
const filterCountEl = document.getElementById("filterCount");
const countEl2 = document.getElementById("eventsCount2");
const emptyMsgEl = empty?.querySelector("p");
const emptyCtaEl = empty?.querySelector("a");
const datePillsEl = document.getElementById("datePills");
const sortSelectEl = document.getElementById("sortSelect");
const clearFiltersBtn = document.getElementById("clearFilters");
const detailsContentEl = document.getElementById("eventDetailsContent");
const savedListEl = document.getElementById("savedList");
const searchWhatEl = document.getElementById("searchWhat");
const searchWhenEl = document.getElementById("searchWhen");
const searchWhereEl = document.getElementById("searchWhere");
const searchBtnEl = document.getElementById("searchBtn");
const featuredGridEl = document.getElementById("featuredGrid");
const featuredEmptyEl = document.getElementById("featuredEmpty");
const featuredCountEl = document.getElementById("featuredCount");
const listViewEl = document.getElementById("eventsListView");
const mapViewEl = document.getElementById("eventsMapView");
const mapCanvasEl = document.getElementById("mapCanvas");
const mapEventsEl = document.getElementById("mapEvents");
const mapCountEl = document.getElementById("mapCount");
const viewToggleEls = Array.from(document.querySelectorAll(".view-toggle [data-view]"));

/* =========================
   State
========================= */
let currentUserId = null;
let isCurrentUserAdmin = false;
let allEvents = [];
let activeCategory = "Alla";
let activeDateRange = "Alla";
let activeSort = "Senast";
let selectedEventId = null;
let savedEventIds = new Set();
let adminProfiles = [];
let adminUserSearch = "";
let adminProfilesError = false;
let adminExpandedIds = new Set();
let searchQuery = "";
let searchPlace = "";
let searchDate = "";
let activeView = "list";
let lastRenderedList = [];
let policeModeActive = false;
let policeEvents = [];
let policeEventsLoaded = false;
let policeEventsLoading = false;
let policeEventsError = "";

const POLICE_EVENTS_URL = "https://polisen.se/api/events";
const POLICE_EVENTS_PROXY_URL = `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(POLICE_EVENTS_URL)}`;
const POLICE_SITE_BASE = "https://polisen.se";

const PROFILE_FIELDS_FULL = "id, username, full_name, avatar_url, is_admin, is_verified";
const PROFILE_FIELDS_ADMIN_ONLY = "id, username, full_name, avatar_url, is_admin";
const PROFILE_FIELDS_BASIC = "id, username, full_name, avatar_url";
const OWNER_ADMIN_ID = "bfb4458c-2284-4cb9-b40e-1359a723b003";

/* =========================
   Categories / Filters
========================= */
const CATEGORY_OPTIONS = [
  "Alla",
  "Musik",
  "Konst & Kultur",
  "Sport & Motion",
  "Mat & Dryck",
  "Familj",
  "Marknad",
  "Föreläsning",
  "Natur & Friluftsliv"
];

const DATE_OPTIONS = ["Alla", "Idag", "Denna vecka", "Helgen"];
const SORT_OPTIONS = ["Senast", "Snart", "Populärast"];

/* =========================
   Helpers (svenska)
========================= */
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);

  const m = Math.floor(diff / 60);
  const h = Math.floor(diff / 3600);
  const days = Math.floor(diff / 86400);

  if (diff < 60) return "Nyss";
  if (m < 60) return `${m} min sedan`;
  if (h < 24) return `${h} timmar sedan`;
  if (days === 1) return "1 dag sedan";
  return `${days} dagar sedan`;
}

function fmtTime(t) {
  if (!t) return "";
  // Supabase time kan komma som "13:45:00" -> vi vill "13:45"
  return String(t).slice(0, 5);
}

function fmtDateSv(d) {
  // d kan vara "YYYY-MM-DD" eller ISO
  if (!d) return "";
  const dt = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`)
    : new Date(d);

  if (isNaN(dt.getTime())) return String(d);

  return dt.toLocaleDateString("sv-SE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateShortSv(d) {
  if (!d) return "";
  const dt = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(`${d}T00:00:00`)
    : new Date(d);

  if (isNaN(dt.getTime())) return "";

  return dt.toLocaleDateString("sv-SE", {
    day: "2-digit",
    month: "short"
  });
}

function truncate(text, max = 120) {
  const s = String(text || "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeText(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeCategory(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v) return "";
  const found = CATEGORY_OPTIONS.find((c) => c.toLowerCase() === v);
  return found || raw;
}

function isFreePrice(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "gratis" || v === "free" || v === "0" || v === "0kr" || v === "0 kr";
}

function formatPriceLabel(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (isFreePrice(v)) return "Gratis";
  if (/^\d+(?:[.,]\d+)?$/.test(v)) return `${v} kr`;
  return v;
}

const ICONS = {
  calendar: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="3"></rect>
      <path d="M8 2v4M16 2v4M3 10h18"></path>
    </svg>
  `,
  clock: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 7v5l3 3"></path>
    </svg>
  `,
  pin: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"></path>
      <circle cx="12" cy="10" r="2.5"></circle>
    </svg>
  `,
  users: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="8" cy="8" r="3"></circle>
      <circle cx="17" cy="9" r="2.5"></circle>
      <path d="M2 20a6 6 0 0 1 12 0"></path>
      <path d="M14 20a5 5 0 0 1 8 0"></path>
    </svg>
  `
};

function initialsFrom(name) {
  const s = (name || "").trim();
  if (!s) return "AN";
  const parts = s.split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] || "A";
  const b = parts.length > 1 ? parts[1]?.[0] : (parts[0]?.[1] || "N");
  return (a + b).toUpperCase();
}

function authorNameFromProfile(profile, fallback = "Användare") {
  return profile?.full_name || profile?.username || fallback;
}

function displayName(profile) {
  return profile?.full_name || profile?.username || "Användare";
}

function profileBadgeMarkup(profile) {
  if (!profile) return "";
  if (profile.is_admin) {
    return `<span class="user-badge is-admin" role="img" aria-label="Owner" data-tooltip="Owner">✔</span>`;
  }
  if (profile.is_verified) {
    return `<span class="user-badge is-verified" role="img" aria-label="Verifierad" data-tooltip="Verifierad">✓</span>`;
  }
  return "";
}

function profileAvatarMarkup(profile, fallbackText, displayName) {
  const avatarUrl = profile?.avatar_url || "";
  const safeName = safeText(displayName || "Användare");
  if (!avatarUrl) {
    return `<span class="event-host-avatar">${fallbackText}</span>`;
  }

  return `
    <span class="event-host-avatar has-img">
      ${fallbackText}
      <img
        src="${avatarUrl}"
        alt="${safeName} profilbild"
        loading="lazy"
        onerror="this.closest('.event-host-avatar').classList.remove('has-img'); this.remove();"
      />
    </span>
  `;
}

function fmtKommer(count) {
  if (count === 1) return "1 st kommer";
  return `${count} st kommer`;
}

function normalizeMapsUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return "";

  if (/^https?:\/\//i.test(v)) return v;

  if (/^(maps\.app\.goo\.gl|goo\.gl\/maps|www\.google\.|maps\.google\.)/i.test(v)) {
    return `https://${v}`;
  }

  return v;
}

function isGoogleMapsUrl(raw) {
  const v = (raw || "").trim();
  if (!v) return false;

  return (
    /^https?:\/\/(www\.)?google\.[^/]+\/maps/i.test(v) ||
    /^https?:\/\/maps\.google\.[^/]+/i.test(v) ||
    /^https?:\/\/maps\.app\.goo\.gl\//i.test(v) ||
    /^https?:\/\/goo\.gl\/maps\//i.test(v)
  );
}

function decodePlaceLabel(raw) {
  try {
    return decodeURIComponent(String(raw).replace(/\+/g, " "));
  } catch {
    return String(raw).replace(/\+/g, " ");
  }
}

function extractPlaceLabelFromUrl(raw) {
  try {
    const url = new URL(raw);
    const path = url.pathname || "";
    const idx = path.indexOf("/place/");
    if (idx !== -1) {
      const after = path.slice(idx + "/place/".length);
      const segment = after.split("/")[0];
      if (segment) return decodePlaceLabel(segment);
    }

    const q =
      url.searchParams.get("query") ||
      url.searchParams.get("q") ||
      url.searchParams.get("destination");
    if (q) return decodePlaceLabel(q);
  } catch {}

  return "";
}

function buildPlaceMeta(placeValue) {
  const raw = (placeValue || "").trim();
  if (!raw) return { label: "", href: "" };

  const normalized = normalizeMapsUrl(raw);

  if (isGoogleMapsUrl(normalized)) {
    const label = extractPlaceLabelFromUrl(normalized) || "Öppna plats";
    return { label, href: normalized };
  }

  return {
    label: raw,
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(raw)}`
  };
}

function toPoliceAbsoluteUrl(rawPath) {
  const path = String(rawPath || "").trim();
  if (!path) return POLICE_SITE_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${POLICE_SITE_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

function parsePoliceDateTime(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;

  const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*([+-]\d{2}:\d{2})$/);
  if (parts) {
    const [, year, month, day, hour, minute, second, offset] = parts;
    const iso = `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:${minute}:${second}${offset}`;
    const parsed = new Date(iso);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const normalized = value
    .replace(" ", "T")
    .replace(/\s([+-]\d{2}:\d{2})$/, "$1");
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtPoliceDateTime(raw) {
  const dt = parsePoliceDateTime(raw);
  if (!dt) return "Okänd tid";
  return dt.toLocaleString("sv-SE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizePoliceEvent(item) {
  if (!item || typeof item !== "object") return null;
  const id = item.id ? String(item.id) : "";
  if (!id) return null;

  return {
    id,
    name: String(item.name || "Händelsenotis"),
    summary: String(item.summary || "").trim(),
    type: String(item.type || "Övrigt"),
    datetime: String(item.datetime || ""),
    locationName: String(item?.location?.name || "Okänd plats"),
    href: toPoliceAbsoluteUrl(item.url)
  };
}

/**
 * Sluttid:
 * - om end_time är "HH:MM" => använd
 * - om end_time är "sent" => använd starttid (det finns ingen riktig sluttid)
 * - annars => använd time
 */
function resolveEndTime(ev) {
  const et = (ev?.end_time || "").trim();

  if (et === "sent") return "sent";
  if (/^\d{2}:\d{2}/.test(et)) return fmtTime(et);

  return ev?.time ? fmtTime(ev.time) : null;
}

/**
 * Bygger JS Date från ev.date + (end_time eller time)
 * date = date (YYYY-MM-DD)
 */
function eventEndAsDate(ev) {
  if (!ev?.date) return null;

  // Om "sent": vi kan inte veta exakt när det slutar, så vi använder starttid
  // (för filtrering blir det ändå samma datum)
  const t = resolveEndTime(ev);
  const time = t && t !== "sent" ? t : (ev.time ? fmtTime(ev.time) : "23:59");

  const dateStr = typeof ev.date === "string" ? ev.date : new Date(ev.date).toISOString().slice(0, 10);
  const dt = new Date(`${dateStr}T${time}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function eventStartAsDate(ev) {
  if (!ev?.date) return null;
  const t = ev?.time ? fmtTime(ev.time) : "00:00";
  const dateStr = typeof ev.date === "string" ? ev.date : new Date(ev.date).toISOString().slice(0, 10);
  const dt = new Date(`${dateStr}T${t}:00`);
  return isNaN(dt.getTime()) ? null : dt;
}

function eventDateKey(ev) {
  if (!ev?.date) return "";
  if (typeof ev.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return ev.date;
  const dt = new Date(ev.date);
  if (isNaN(dt.getTime())) return "";
  return dt.toISOString().slice(0, 10);
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d) {
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  end.setHours(23, 59, 59, 999);
  return end;
}

function weekStart(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  return startOfDay(start);
}

function weekEnd(d) {
  const start = weekStart(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function weekendRange(d) {
  const start = weekStart(d);
  const saturday = new Date(start);
  saturday.setDate(start.getDate() + 5);
  const sunday = new Date(start);
  sunday.setDate(start.getDate() + 6);
  return { start: startOfDay(saturday), end: endOfDay(sunday) };
}

/* =========================
   Auth
========================= */
async function loadCurrentUser() {
  const { data } = await supabase.auth.getUser();
  currentUserId = data?.user?.id || null;
  isCurrentUserAdmin = false;

  if (currentUserId) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', currentUserId)
        .single();
      if (!error && profile) isCurrentUserAdmin = !!profile.is_admin;
    } catch (e) {
      console.warn('⚠️ Kunde inte hämta is_admin:', e?.message || e);
    }
  }
} 

/* =========================
   Sparade (localStorage)
========================= */
const SAVED_KEY = "he_saved_events";

function loadSavedFromStorage() {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list)) {
      savedEventIds = new Set(list.map((id) => String(id)));
    }
  } catch (e) {
    savedEventIds = new Set();
  }
}

function persistSavedToStorage() {
  try {
    const list = Array.from(savedEventIds.values());
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch (e) {
    // ignore
  }
}

function isSavedEvent(id) {
  return savedEventIds.has(String(id));
}

function toggleSavedEvent(id) {
  const key = String(id);
  if (savedEventIds.has(key)) {
    savedEventIds.delete(key);
  } else {
    savedEventIds.add(key);
  }
  persistSavedToStorage();
}

/* =========================
   Attendees
========================= */
async function fetchAttendeesMeta(eventIds) {
  const counts = new Map();
  const mine = new Set();

  if (!eventIds.length) return { counts, mine };

  const { data, error } = await supabase
    .from("event_attendees")
    .select("event_id, user_id")
    .in("event_id", eventIds);

  if (error) {
    console.warn("⚠️ Kunde inte hämta deltagare:", error.message);
    return { counts, mine };
  }

  for (const row of data || []) {
    counts.set(row.event_id, (counts.get(row.event_id) || 0) + 1);
    if (currentUserId && row.user_id === currentUserId) mine.add(row.event_id);
  }

  return { counts, mine };
}

async function fetchAttendeesList(eventId) {
  const { data, error } = await supabase
    .from("event_attendees")
    .select(`user_id, profiles:user_id ( ${PROFILE_FIELDS_BASIC} )`)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function setAttend(eventId, shouldAttend) {
  if (!currentUserId) {
    alert("Du behöver vara inloggad för att markera att du kommer.");
    return false;
  }

  if (shouldAttend) {
    const { error } = await supabase
      .from("event_attendees")
      .insert([{ event_id: eventId, user_id: currentUserId }]);

    if (error) {
      console.warn("⚠️ Kunde inte anmäla:", error.message);
      return false;
    }
    return true;
  } else {
    const { error } = await supabase
      .from("event_attendees")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", currentUserId);

    if (error) {
      console.warn("⚠️ Kunde inte avanmäl:", error.message);
      return false;
    }
    return true;
  }
}

/* =========================
   Rapportera
========================= */
async function reportEvent(eventId, reason) {
  if (!currentUserId) {
    alert("Du behöver vara inloggad för att rapportera.");
    return false;
  }

  try {
    const attempts = [
      { event_id: eventId, reporter_id: currentUserId, reason: reason || null },
      { event_id: eventId, user_id: currentUserId, reason: reason || null }
    ];

    let lastError = null;

    for (const payload of attempts) {
      const { error } = await supabase
        .from("event_reports")
        .insert([payload]);

      if (!error) {
        alert("Tack! Din rapport har skickats.");
        return true;
      }

      lastError = error;
      const msg = String(error?.message || "").toLowerCase();
      const missingColumn =
        error?.code === "42703" ||
        msg.includes("reporter_id") ||
        msg.includes("user_id");

      if (!missingColumn) break;
    }

    if (lastError) {
      console.warn("⚠️ Kunde inte rapportera:", lastError.message || lastError);
    }
    alert("Kunde inte skicka rapport. Funktionen är inte konfigurerad ännu.");
    return false;
  } catch (err) {
    alert("Kunde inte skicka rapport.");
    return false;
  }
}

/* =========================
   Modal (Visa lista)
========================= */
function ensureAttendeesModal() {
  if (document.getElementById("attendeesModal")) return;

  const modal = document.createElement("div");
  modal.id = "attendeesModal";
  modal.hidden = true;

  modal.innerHTML = `
    <div class="att-modal-backdrop" data-close="1"></div>
    <div class="att-modal" role="dialog" aria-modal="true" aria-label="Deltagarlista">
      <div class="att-modal-top">
        <div class="att-modal-title">Deltagarlista</div>
        <button class="att-modal-close" data-close="1" aria-label="Stäng">✕</button>
      </div>
      <div class="att-modal-body" id="attendeesModalBody">Laddar...</div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => {
    if (e.target?.dataset?.close) closeAttendeesModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAttendeesModal();
  });
}

function openAttendeesModal(html) {
  ensureAttendeesModal();
  const modal = document.getElementById("attendeesModal");
  const body = document.getElementById("attendeesModalBody");
  body.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeAttendeesModal() {
  const modal = document.getElementById("attendeesModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = "";
}

/* =========================
   Admin helpers
========================= */
function normalizeSearchTerm(term) {
  return String(term || "").trim().toLowerCase();
}

function profileLabel(profile) {
  return profile?.full_name || profile?.username || profile?.id || "Användare";
}

function buildProfileSearchText(profile) {
  return [
    profile?.full_name,
    profile?.username,
    profile?.id
  ].filter(Boolean).join(" ").toLowerCase();
}

function filterProfilesBySearch(list, term) {
  const q = normalizeSearchTerm(term);
  if (!q) return list || [];
  return (list || []).filter((p) => buildProfileSearchText(p).includes(q));
}

function sortProfiles(list) {
  return [...(list || [])].sort((a, b) => {
    const aLabel = profileLabel(a).toLowerCase();
    const bLabel = profileLabel(b).toLowerCase();
    return aLabel.localeCompare(bLabel, "sv");
  });
}

function splitProfilesByStatus(list) {
  const admins = [];
  const verified = [];
  const unverified = [];

  for (const p of list || []) {
    if (p?.is_admin) {
      admins.push(p);
    } else if (p?.is_verified) {
      verified.push(p);
    } else {
      unverified.push(p);
    }
  }

  return {
    admins: sortProfiles(admins),
    verified: sortProfiles(verified),
    unverified: sortProfiles(unverified)
  };
}

function canDemoteAdmin() {
  return !!currentUserId && currentUserId === OWNER_ADMIN_ID;
}

function canPromoteAdmin() {
  return !!currentUserId && currentUserId === OWNER_ADMIN_ID;
}

function renderAdminUserRow(p) {
  const primary = safeText(profileLabel(p));
  const username = safeText(p?.username || "");
  const fullName = safeText(p?.full_name || "");
  const id = safeText(p?.id || "");
  const isAdmin = !!p?.is_admin;
  const isVerified = !!p?.is_verified;
  const label = safeText(profileLabel(p));
  const metaParts = [];
  if (fullName && fullName !== primary) metaParts.push(fullName);
  if (username && username !== primary) metaParts.push(`@${username}`);

  const hasDetails = !!(metaParts.length || id);
  const isExpanded = adminExpandedIds.has(id);
  const canRemoveAdmin = !isAdmin || canDemoteAdmin();
  const adminBtnDisabled = isAdmin && !canRemoveAdmin;
  const canMakeAdmin = isAdmin ? true : canPromoteAdmin();
  const makeAdminDisabled = !isAdmin && !canMakeAdmin;
  const adminBtnDisabledFinal = adminBtnDisabled || makeAdminDisabled;
  const adminBtnLabel = isAdmin
    ? (adminBtnDisabled ? "Endast ägaren" : "Ta bort admin")
    : (makeAdminDisabled ? "Endast ägaren" : "Gör admin");
  const adminBtnTitle = adminBtnDisabled
    ? "Endast ägaren kan ta bort admin"
    : (makeAdminDisabled ? "Endast ägaren kan göra admins" : "");

  return `
    <li class="admin-user" data-user-id="${id}">
      <div class="admin-user-main">
        <div class="admin-user-text">
          <div class="admin-user-name">${primary}</div>
          ${hasDetails ? `
            <div class="admin-user-details" ${isExpanded ? "" : "hidden"}>
              <div class="admin-user-meta">
                ${metaParts.map((t) => `<span>${t}</span>`).join("")}
                ${id ? `<span>ID: <code>${id}</code></span>` : ""}
              </div>
            </div>
          ` : ""}
        </div>
        <div class="admin-user-badges">
          ${isAdmin ? `<span class="admin-pill is-admin">Admin</span>` : ""}
          ${isVerified ? `<span class="admin-pill is-verified">Verifierad</span>` : ""}
        </div>
      </div>
      <div class="admin-user-actions">
        ${hasDetails ? `
          <button class="admin-action-btn ghost admin-more-btn" data-action="admin-toggle-details" data-id="${id}" aria-expanded="${isExpanded ? "true" : "false"}">
            ${isExpanded ? "Mindre" : "Mer"}
          </button>
        ` : ""}
        <button class="admin-action-btn" data-action="admin-toggle-admin" data-id="${id}" data-is-admin="${isAdmin}" data-name="${label}" ${adminBtnDisabledFinal ? "disabled" : ""} ${adminBtnTitle ? `title="${adminBtnTitle}"` : ""}>
          ${adminBtnLabel}
        </button>
        <button class="admin-action-btn" data-action="admin-toggle-verify" data-id="${id}" data-is-verified="${isVerified}" data-name="${label}">
          ${isVerified ? "Avverifiera" : "Verifiera"}
        </button>
      </div>
    </li>
  `;
}

function renderAdminUsersList(list, emptyLabel = "Inga profiler hittades.") {
  if (!list.length) return `<li class="admin-empty">${emptyLabel}</li>`;

  const grouped = splitProfilesByStatus(list);
  const sections = [
    { title: "Admin", items: grouped.admins },
    { title: "Verifierad", items: grouped.verified },
    { title: "Ej verifierad", items: grouped.unverified }
  ];

  let html = "";

  for (const section of sections) {
    if (!section.items.length) continue;
    html += `
      <li class="admin-section-title">
        <span>${section.title}</span>
        <span class="admin-section-count">${section.items.length}</span>
      </li>
      ${section.items.map((p) => renderAdminUserRow(p)).join("")}
    `;
  }

  return html || `<li class="admin-empty">${emptyLabel}</li>`;
}

function updateAdminUsersView() {
  const listEl = document.getElementById("adminUsersList");
  const countEl = document.getElementById("adminUserCount");
  if (!listEl) return;

  const filtered = filterProfilesBySearch(adminProfiles, adminUserSearch);
  listEl.innerHTML = renderAdminUsersList(
    filtered,
    adminProfilesError ? "Kunde inte ladda profiler." : "Inga profiler hittades."
  );
  if (countEl) countEl.textContent = `${filtered.length} profiler`;
}

async function loadReports() {
  const attempts = [
    "id, event_id, reporter_id, reason, created_at, events:event_id ( title, user_id )",
    "id, event_id, user_id, reason, created_at, events:event_id ( title, user_id )",
    "id, event_id, reporter_id, reason, created_at",
    "id, event_id, user_id, reason, created_at"
  ];

  let lastError = null;

  for (const fields of attempts) {
    const res = await supabase
      .from("event_reports")
      .select(fields)
      .order("created_at", { ascending: false });

    if (!res.error) return res;
    lastError = res.error;
  }

  return { error: lastError };
}

/* =========================
   Admin panel (modal + loader)
========================= */
function ensureAdminModal() {
  if (document.getElementById("adminModal")) return;

  const modal = document.createElement("div");
  modal.id = "adminModal";
  modal.hidden = true;

  modal.innerHTML = `
    <div class="att-modal-backdrop" data-close="1"></div>
    <div class="att-modal" role="dialog" aria-modal="true" aria-label="Adminpanel">
      <div class="att-modal-top">
        <div class="att-modal-title">Adminpanel</div>
        <button class="att-modal-close" data-close="1" aria-label="Stäng">✕</button>
      </div>
      <div class="att-modal-body" id="adminModalBody">Laddar...</div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.addEventListener("click", async (e) => {
    const target = e.target;
    const actionBtn = target?.closest ? target.closest("[data-action]") : null;
    const tabBtn = target?.closest ? target.closest("[data-tab]") : null;
    const closeBtn = target?.closest ? target.closest("[data-close]") : null;
    const action = actionBtn?.dataset?.action;
    const tab = tabBtn?.dataset?.tab;

    if (action === "copy-uid") {
      try {
        await navigator.clipboard.writeText(currentUserId || "");
        alert("UID kopierat till urklipp");
      } catch (err) {
        alert("Kunde inte kopiera UID");
      }
      return;
    }

    if (action === "refresh-admin") {
      await loadAdminPanel();
      return;
    }

    if (action === "admin-clear-search") {
      adminUserSearch = "";
      const input = document.getElementById("adminUserSearch");
      if (input) input.value = "";
      updateAdminUsersView();
      return;
    }

    if (action === "admin-toggle-details") {
      const id = actionBtn?.dataset?.id || "";
      const listEl = document.getElementById("adminUsersList");
      if (!id || !listEl) return;

      const row = Array.from(listEl.querySelectorAll(".admin-user"))
        .find((el) => el.dataset.userId === id);
      if (!row) return;

      const details = row.querySelector(".admin-user-details");
      const btn = row.querySelector('[data-action="admin-toggle-details"]');
      if (!details || !btn) return;

      const isOpen = !details.hidden;
      details.hidden = isOpen;

      if (isOpen) {
        adminExpandedIds.delete(id);
        btn.textContent = "Mer";
        btn.setAttribute("aria-expanded", "false");
      } else {
        adminExpandedIds.add(id);
        btn.textContent = "Mindre";
        btn.setAttribute("aria-expanded", "true");
      }
      return;
    }

      if (action === "admin-delete-event") {
        const id = actionBtn?.dataset?.id;
        if (!id) return;
        if (!confirm('Vill du verkligen ta bort denna händelse?')) return;
        try {
          const { error } = await supabase.from("events").delete().eq("id", id);
          if (error) { alert("Kunde inte ta bort: " + (error.message || error)); return; }
          await loadAdminPanel();
        } catch (err) {
          alert("Kunde inte ta bort: " + (err?.message || err));
        }
        return;
      }

      if (action === "admin-accept-report") {
        const id = actionBtn?.dataset?.id;
        const eventId = actionBtn?.dataset?.eventId || "";
        if (!id) return;
        if (!confirm('Acceptera rapport? Eventet tas bort.')) return;
        try {
          if (eventId) {
            const delEvent = await supabase.from("events").delete().eq("id", eventId);
            if (delEvent.error) {
              alert("Kunde inte ta bort eventet: " + (delEvent.error.message || delEvent.error));
              return;
            }
          }
          const delReport = await supabase.from("event_reports").delete().eq("id", id);
          if (delReport.error) {
            alert("Kunde inte ta bort rapport: " + (delReport.error.message || delReport.error));
            return;
          }
          await loadAdminPanel();
        } catch (err) {
          alert("Kunde inte uppdatera: " + (err?.message || err));
        }
        return;
      }

      if (action === "admin-deny-report") {
        const id = actionBtn?.dataset?.id;
        if (!id) return;
        if (!confirm('Neka rapport? Eventet behålls och rapporten tas bort.')) return;
        try {
          const { error } = await supabase.from("event_reports").delete().eq("id", id);
          if (error) { alert("Kunde inte ta bort rapport: " + (error.message || error)); return; }
          await loadAdminPanel();
        } catch (err) {
          alert("Kunde inte uppdatera: " + (err?.message || err));
        }
        return;
      }

    if (action === "admin-toggle-admin") {
      const id = actionBtn?.dataset?.id;
      const isAdmin = actionBtn?.dataset?.isAdmin === "true";
      const name = actionBtn?.dataset?.name || id;
      if (!id) return;
      if (isAdmin && !canDemoteAdmin()) {
        alert("Endast ägaren kan ta bort admin från andra admins.");
        return;
      }
      if (!isAdmin && !canPromoteAdmin()) {
        alert("Endast ägaren kan göra andra till admins.");
        return;
      }
      if (!confirm((isAdmin ? 'Ta bort admin-rättigheter för ' : 'Ge admin-rättigheter till ') + name + '?')) return;
      try {
        const { error } = await supabase.from('profiles').update({ is_admin: !isAdmin }).eq('id', id);
        if (error) { alert('Kunde inte uppdatera: ' + (error.message || error)); return; }
        await loadAdminPanel();
      } catch (err) {
        alert('Kunde inte uppdatera: ' + (err?.message || err));
      }
      return;
    }

    if (action === "admin-toggle-verify") {
      const id = actionBtn?.dataset?.id;
      const isVerified = actionBtn?.dataset?.isVerified === "true";
      const name = actionBtn?.dataset?.name || id;
      if (!id) return;
      if (!confirm((isVerified ? 'Ta bort verifiering för ' : 'Verifiera ') + name + '?')) return;
      try {
        const { error } = await supabase.from('profiles').update({ is_verified: !isVerified }).eq('id', id);
        if (error) { alert('Kunde inte uppdatera: ' + (error.message || error)); return; }
        await loadAdminPanel();
      } catch (err) {
        alert('Kunde inte uppdatera: ' + (err?.message || err));
      }
      return;
    }

    if (tab) {
      const body = document.getElementById('adminModalBody');
      if (!body) return;
      body.querySelectorAll('[data-admin-tab]').forEach(el => el.hidden = el.dataset.adminTab !== tab);
      body.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.toggle('is-on', b.dataset.tab === tab));
      return;
    }

    if (closeBtn) closeAdminModal();
  });

  modal.addEventListener("input", (e) => {
    const target = e.target;
    if (target?.id === "adminUserSearch") {
      adminUserSearch = target.value || "";
      updateAdminUsersView();
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAdminModal(); });
}

function openAdminModal(html) {
  ensureAdminModal();
  const modal = document.getElementById('adminModal');
  const body = document.getElementById('adminModalBody');
  body.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

async function loadAdminProfiles() {
  const attempts = [
    "id, username, full_name, is_admin, is_verified",
    "id, username, full_name, is_admin"
  ];

  let lastError = null;

  for (const fields of attempts) {
    const res = await supabase
      .from("profiles")
      .select(fields)
      .order("username");

    if (!res.error) return res;

    lastError = res.error;
    const msg = String(res.error?.message || "").toLowerCase();
    const missingColumn = res.error?.code === "42703" || msg.includes("is_verified");
    if (!missingColumn) return res;
  }

  return { error: lastError };
}

async function loadAdminPanel() {
  openAdminModal('<p>Laddar adminpanelen...</p>');

    try {
      const evRes = await loadEventsWithJoin();
      const profilesRes = await loadAdminProfiles();
      const reportsRes = await loadReports();

      const events = evRes.error ? (await loadEventsNoJoin()).data || [] : evRes.data || [];
      const profiles = profilesRes.error ? [] : profilesRes.data || [];
      adminProfiles = profiles;
      adminProfilesError = !!profilesRes.error;

      const reports = reportsRes.error ? [] : reportsRes.data || [];
      const reportsErrorMsg = String(reportsRes.error?.message || "").toLowerCase();
      const reportsMissing =
        reportsRes.error &&
        (reportsRes.error?.code === "42P01" || reportsErrorMsg.includes("event_reports"));

      const eventsHtml = events.map(ev => {
        const author = authorNameFromProfile(ev.profiles, 'Användare');
        return `<li class="admin-event" style="padding:8px;border-bottom:1px solid #eee;">
          <strong>${ev.title || '(utan titel)'}</strong> — ${author} — ${fmtDateSv(ev.date)} 
          <button data-action="admin-delete-event" data-id="${ev.id}" style="margin-left:8px;">🗑️ Ta bort</button>
        </li>`;
      }).join('');

      const reportsHtml = reportsRes.error
        ? `<li class="admin-empty">${reportsMissing ? "Rapport-funktionen är inte konfigurerad." : "Kunde inte ladda rapporter."}</li>`
        : (reports.length ? reports.map((rep) => {
            const title = rep?.events?.title || rep?.event_id || "Okänt event";
            const reason = rep?.reason ? safeText(rep.reason) : "Ingen orsak angiven.";
            const created = rep?.created_at ? fmtDateSv(rep.created_at) : "";
            const reporterRaw = rep?.reporter_id || rep?.user_id || "";
            const reporter = reporterRaw ? safeText(reporterRaw) : "Okänd";
            const eventId = rep?.event_id ? safeText(rep.event_id) : "Okänd";
            return `
              <li class="admin-report">
                <div class="admin-report-title">${safeText(title)}</div>
                <div class="admin-report-meta">
                  <span>Rapportör: <code>${reporter}</code></span>
                  <span>Event-ID: <code>${eventId}</code></span>
                  ${created ? `<span>${created}</span>` : ""}
                </div>
                <div class="admin-report-reason">${reason}</div>
                <div class="admin-report-actions">
                  <button class="admin-action-btn" data-action="admin-accept-report" data-id="${rep.id}" data-event-id="${rep.event_id || ""}">Acceptera (ta bort event)</button>
                  <button class="admin-action-btn ghost" data-action="admin-deny-report" data-id="${rep.id}">Neka (behåll event)</button>
                </div>
              </li>
            `;
          }).join('') : `<li class="admin-empty">Inga rapporter.</li>`);

    const filteredProfiles = filterProfilesBySearch(profiles, adminUserSearch);
    const usersHtml = renderAdminUsersList(
      filteredProfiles,
      adminProfilesError ? "Kunde inte ladda profiler." : "Inga profiler hittades."
    );

    const html = `
      <div class="admin-toolbar">
        <div class="admin-meta">
          <span>Min uid:</span> <code id="adminUid">${currentUserId || ''}</code>
          <button class="admin-action-btn ghost" data-action="copy-uid">Kopiera</button>
        </div>
        <div><button class="admin-action-btn" data-action="refresh-admin">Uppdatera</button></div>
      </div>
        <div class="admin-tabs">
          <button class="admin-tab-btn is-on" data-tab="events">Händelser</button>
          <button class="admin-tab-btn" data-tab="reports">Rapporter</button>
          <button class="admin-tab-btn" data-tab="users">Profiler</button>
        </div>
        <div data-admin-tab="events">
          <ul style="list-style:none;padding:0;margin:0;">${eventsHtml || '<li>Inga händelser</li>'}</ul>
        </div>
        <div data-admin-tab="reports" hidden>
          <ul class="admin-reports">${reportsHtml}</ul>
        </div>
        <div data-admin-tab="users" hidden>
        <div class="admin-user-toolbar">
          <input
            id="adminUserSearch"
            class="admin-user-search"
            type="search"
            placeholder="Sök efter namn, användare eller id..."
            value="${safeText(adminUserSearch)}"
          />
          <button class="admin-action-btn ghost" data-action="admin-clear-search">Rensa</button>
          <div class="admin-user-count" id="adminUserCount">${profilesRes.error ? "0 profiler" : `${filteredProfiles.length} profiler`}</div>
        </div>
        <ul class="admin-users" id="adminUsersList">${usersHtml}</ul>
      </div>
    `;

    openAdminModal(html);
  } catch (err) {
    openAdminModal('<p>Kunde inte ladda adminpanelen.</p>');
    console.warn('⚠️ Admin panel load failed:', err?.message || err);
  }
}

function ensureAdminToggle() {
  if (!isCurrentUserAdmin) return;
  if (document.getElementById('adminToggle')) return;

  const btn = document.createElement('button');
  btn.id = 'adminToggle';
  btn.textContent = 'Admin';
  btn.title = 'Öppna adminpanel';
  btn.style.position = 'fixed';
  btn.style.right = '12px';
  btn.style.bottom = '12px';
  btn.style.zIndex = 1000;
  btn.style.padding = '8px 10px';
  btn.style.borderRadius = '6px';
  btn.style.background = '#d00';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.addEventListener('click', () => { loadAdminPanel(); });
  document.body.appendChild(btn);
}

/* =========================
   Data: Events + profiles join/fallback
========================= */
async function loadEventsWithJoin() {
  const buildSelect = (profileFields, includeCategoryPrice) => `
    id, created_at, title, ${includeCategoryPrice ? "category, price," : ""} place, date, time, end_time, info, image_urls, user_id,
    profiles:user_id ( ${profileFields} )
  `;

  const attempts = [
    { profileFields: PROFILE_FIELDS_FULL, includeCategoryPrice: true },
    { profileFields: PROFILE_FIELDS_ADMIN_ONLY, includeCategoryPrice: true },
    { profileFields: PROFILE_FIELDS_FULL, includeCategoryPrice: false },
    { profileFields: PROFILE_FIELDS_ADMIN_ONLY, includeCategoryPrice: false },
    { profileFields: PROFILE_FIELDS_BASIC, includeCategoryPrice: false }
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const res = await supabase
      .from("events")
      .select(buildSelect(attempt.profileFields, attempt.includeCategoryPrice))
      .order("created_at", { ascending: false });

    if (!res.error) return res;

    lastError = res.error;
    const msg = String(res.error?.message || "").toLowerCase();
    const missingColumn =
      res.error?.code === "42703" ||
      msg.includes("category") ||
      msg.includes("price") ||
      msg.includes("is_verified") ||
      msg.includes("is_admin");

    if (!missingColumn) return res;
  }

  return { error: lastError };
}

async function loadEventsNoJoin() {
  const res = await supabase
    .from("events")
    .select("id, created_at, title, category, price, place, date, time, end_time, info, image_urls, user_id")
    .order("created_at", { ascending: false });

  if (!res.error) return res;

  const msg = String(res.error?.message || "").toLowerCase();
  const missingColumn = res.error?.code === "42703" || msg.includes("category") || msg.includes("price");
  if (!missingColumn) return res;

  return await supabase
    .from("events")
    .select("id, created_at, title, place, date, time, end_time, info, image_urls, user_id")
    .order("created_at", { ascending: false });
}

async function loadProfilesForUserIds(userIds) {
  if (!userIds.length) return new Map();

  const attempts = [PROFILE_FIELDS_FULL, PROFILE_FIELDS_ADMIN_ONLY, PROFILE_FIELDS_BASIC];
  let lastError = null;
  let data = null;

  for (const fields of attempts) {
    const res = await supabase
      .from("profiles")
      .select(fields)
      .in("id", userIds);

    if (!res.error) {
      data = res.data || [];
      lastError = null;
      break;
    }

    lastError = res.error;
    const msg = String(res.error?.message || "").toLowerCase();
    const missingColumn =
      res.error?.code === "42703" ||
      msg.includes("is_verified") ||
      msg.includes("is_admin");

    if (!missingColumn) break;
  }

  if (lastError) {
    console.warn("⚠️ profiles lookup misslyckades:", lastError.message || lastError);
    return new Map();
  }

  const map = new Map();
  for (const p of data || []) map.set(p.id, p);
  return map;
}

/* =========================
   Render
========================= */
function pickFeaturedEvents(list) {
  const items = (list || []).filter((ev) => !!eventStartAsDate(ev) || !!ev.date);
  const sorted = [...items].sort((a, b) => {
    const pop = (b.att_count || 0) - (a.att_count || 0);
    if (pop !== 0) return pop;
    const aDate = eventStartAsDate(a);
    const bDate = eventStartAsDate(b);
    if (aDate && bDate) {
      const diff = aDate.getTime() - bDate.getTime();
      if (diff !== 0) return diff;
    } else if (aDate) {
      return -1;
    } else if (bDate) {
      return 1;
    }
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });

  return sorted.slice(0, 3);
}

function renderFeaturedCard(ev) {
  const imgs = ev.image_urls || [];
  const firstImg = imgs.length ? imgs[0] : null;
  const titleSafe = safeText(ev.title || "Utan titel");
  const dateLabel = fmtDateShortSv(ev.date);
  const dateText = fmtDateSv(ev.date);
  const endResolved = resolveEndTime(ev);
  const timeRange = ev.time
    ? (endResolved && endResolved !== "sent"
        ? `${fmtTime(ev.time)}–${fmtTime(endResolved)}`
        : (endResolved === "sent" ? `${fmtTime(ev.time)} • Sent` : fmtTime(ev.time)))
    : "";
  const placeMeta = buildPlaceMeta(ev.place);

  const meta = [dateText, timeRange, placeMeta.label].filter(Boolean).join(" • ");
  const metaSafe = safeText(meta);

  return `
    <article class="featured-card" data-event-id="${ev.id}">
      <div class="featured-media">
        ${firstImg
          ? `<img src="${firstImg}" alt="${titleSafe}" loading="lazy">`
          : `<div class="event-media-placeholder">Ingen bild</div>`}
        <span class="featured-badge">Utvalt</span>
        ${dateLabel ? `<span class="featured-date">${safeText(dateLabel)}</span>` : ""}
      </div>
      <div class="featured-body">
        <h3 class="featured-title">${titleSafe}</h3>
        ${meta ? `<div class="featured-meta">${metaSafe}</div>` : ""}
        <button class="featured-cta" type="button" data-action="featured-open" data-id="${ev.id}">
          Visa detaljer
        </button>
      </div>
    </article>
  `;
}

function renderFeatured(list) {
  if (!featuredGridEl) return;
  const items = pickFeaturedEvents(list);
  if (featuredCountEl) featuredCountEl.textContent = `${items.length} utvalda`;

  if (!items.length) {
    featuredGridEl.innerHTML = "";
    if (featuredEmptyEl) featuredEmptyEl.hidden = false;
    return;
  }

  if (featuredEmptyEl) featuredEmptyEl.hidden = true;
  featuredGridEl.innerHTML = items.map(renderFeaturedCard).join("");
}

function renderEvent(ev) {
  const imgs = ev.image_urls || [];
  const firstImg = imgs.length ? imgs[0] : null;

  const authorName = authorNameFromProfile(ev.profiles, "Användare");
  const authorNameSafe = safeText(authorName);
  const initials = initialsFrom(authorName);

  const isOwner = !!currentUserId && currentUserId === ev.user_id;
  const endResolved = resolveEndTime(ev);
  const timeRange = ev.time
    ? (endResolved && endResolved !== "sent"
        ? `${fmtTime(ev.time)}–${fmtTime(endResolved)}`
        : (endResolved === "sent" ? `${fmtTime(ev.time)} • Sent` : fmtTime(ev.time)))
    : "";
  const placeMeta = buildPlaceMeta(ev.place);
  const dateText = fmtDateSv(ev.date) || "";
  const categoryLabel = normalizeCategory(ev.category);
  const priceLabel = formatPriceLabel(ev.price);
  const freePrice = isFreePrice(ev.price);
  const fullDesc = String(ev.info || "").trim();
  const hasLongDesc = fullDesc.length > 120;
  const shortDesc = hasLongDesc ? truncate(fullDesc, 120) : fullDesc;
  const shortDescSafe = safeText(shortDesc);
  const fullDescSafe = safeText(fullDesc);
  const badge = profileBadgeMarkup(ev.profiles);
  const avatar = profileAvatarMarkup(ev.profiles, initials, authorName);
  const authorProfileHref = ev.user_id ? `html/Profil.html?uid=${encodeURIComponent(ev.user_id)}` : "";

  const canDelete = isCurrentUserAdmin || (currentUserId && currentUserId === ev.user_id);

  const attCount = ev.att_count || 0;
  const iAmComing = !!ev.i_am_coming;
  const ownerLocked = isOwner && iAmComing;

  return `
    <article class="event-card ${iAmComing ? "is-attending" : ""}" data-event-id="${ev.id}" data-owner-id="${ev.user_id || ""}">
      <div class="event-media">
        ${
          firstImg
            ? `<img src="${firstImg}" alt="${ev.title ? `Bild för ${ev.title}` : "Evenemangsbild"}" loading="lazy">`
            : `<div class="event-media-placeholder">Ingen bild</div>`
        }
        <div class="event-badges">
          ${categoryLabel ? `<span class="event-badge cat" data-category="${categoryLabel}">${categoryLabel}</span>` : ""}
          ${priceLabel ? `<span class="event-badge price ${freePrice ? "is-free" : ""}">${priceLabel}</span>` : ""}
        </div>
        ${canDelete ? `<button class="event-delete" data-action="delete-event" type="button" title="Ta bort händelse" aria-label="Ta bort händelse">🗑️</button>` : ""}
      </div>

      <div class="event-body">
        <h3 class="event-title">${ev.title || ""}</h3>

        ${fullDesc ? `
          <div class="event-desc-wrap">
            <p
              class="event-desc"
              data-short="${shortDescSafe}"
              data-full="${fullDescSafe}"
              data-collapsed="${hasLongDesc ? "true" : "false"}"
            >${shortDescSafe}</p>
            ${hasLongDesc ? `
              <button class="event-desc-toggle" data-action="toggle-desc" type="button" aria-expanded="false">
                Visa mer
              </button>
            ` : ""}
          </div>
        ` : ""}

        <div class="event-meta">
          ${dateText ? `<span class="event-meta-item">${ICONS.calendar}<span>${dateText}</span></span>` : ""}
          ${timeRange ? `<span class="event-meta-item">${ICONS.clock}<span>${timeRange}</span></span>` : ""}
        </div>

        ${placeMeta.label ? `
          <div class="event-meta">
            <span class="event-meta-item">${ICONS.pin}<a class="event-place-link" href="${placeMeta.href}" target="_blank" rel="noopener noreferrer">${placeMeta.label}</a></span>
          </div>
        ` : ""}

        <div class="event-footer">
          <div class="event-host">
            ${avatar}
            <div class="event-host-text">
              ${
                authorProfileHref
                  ? `<a class="event-host-name" href="${authorProfileHref}" title="Visa profil">${authorNameSafe}${badge}</a>`
                  : `<span class="event-host-name">${authorNameSafe}${badge}</span>`
              }
              <span class="event-host-time">${timeAgo(ev.created_at)}</span>
            </div>
          </div>

          <div class="attend-meta">
            <span class="attend-count">${ICONS.users}<span>${fmtKommer(attCount)}</span></span>
            <button class="attend-list" data-action="show-attendees" type="button">
              Visa lista
            </button>
          </div>
        </div>

        <div class="event-attend">
          <div class="attend-left">
            <button
              class="attend-btn ${iAmComing ? "is-on" : "is-off"}"
              data-action="toggle-attend"
              type="button"
              ${currentUserId && !ownerLocked ? "" : "disabled"}
              title="${currentUserId ? (ownerLocked ? "Som ägare är du alltid anmäld" : "") : "Logga in för att anmäla dig"}"
            >
              ${ownerLocked ? "Ägare" : (iAmComing ? "⛔ Avbryt" : "✅ Jag kommer")}
            </button>

            <span class="attend-status ${iAmComing ? "is-on" : "is-off"}">
              ${iAmComing ? "Du är anmäld" : "Inte anmäld"}
            </span>
          </div>
        </div>

        ${imgs.length > 1 ? `<div class="event-more">+${imgs.length - 1} fler bilder</div>` : ""}
      </div>
    </article>
  `;
}

function updateFeedModeUi() {
  if (feedTitleEl) {
    feedTitleEl.textContent = policeModeActive ? "Polisens händelser" : "Senaste händelser";
  }

  if (policeToggleEl) {
    policeToggleEl.classList.toggle("is-active", policeModeActive);
    policeToggleEl.setAttribute("aria-pressed", policeModeActive ? "true" : "false");
  }

  if (emptyCtaEl) {
    emptyCtaEl.hidden = policeModeActive;
  }
}

function renderPoliceEvent(item) {
  const title = safeText(item?.name || "Händelsenotis");
  const summary = safeText(item?.summary || "Ingen sammanfattning tillgänglig.");
  const type = safeText(item?.type || "Övrigt");
  const when = safeText(fmtPoliceDateTime(item?.datetime));
  const locationName = safeText(item?.locationName || "Okänd plats");
  const href = safeText(item?.href || POLICE_SITE_BASE);

  return `
    <article class="event-card police-card">
      <div class="event-body">
        <div class="police-card-head">
          <span class="police-badge">${type}</span>
          <span class="police-time">${when}</span>
        </div>

        <h3 class="event-title">${title}</h3>
        <p class="event-desc">${summary}</p>

        <div class="event-meta">
          <span class="event-meta-item">${ICONS.pin}<span>${locationName}</span></span>
        </div>

        <div class="police-actions">
          <a class="details-btn ghost" href="${href}" target="_blank" rel="noopener noreferrer">Läs hos Polisen</a>
        </div>
      </div>
    </article>
  `;
}

function renderPoliceList(list, emptyLabel = "") {
  const items = Array.isArray(list) ? list : [];
  lastRenderedList = [];
  selectedEventId = null;

  const count = items.length;
  if (countEl) countEl.textContent = `${count} händelser`;
  if (filterCountEl) filterCountEl.textContent = `${count} händelser`;
  if (countEl2) countEl2.textContent = `${count}`;

  if (detailsContentEl) {
    detailsContentEl.dataset.eventId = "";
    detailsContentEl.innerHTML = `<p class="details-empty">Detaljer öppnas via knappen "Läs hos Polisen" i varje kort.</p>`;
  }

  if (!count) {
    if (grid) grid.innerHTML = "";
    if (emptyMsgEl) {
      emptyMsgEl.textContent = emptyLabel || "Inga polisnotiser kunde hämtas just nu.";
    }
    if (empty) empty.hidden = false;
    renderMap([]);
    return;
  }

  if (empty) empty.hidden = true;
  if (grid) grid.innerHTML = items.map(renderPoliceEvent).join("");
  renderMap([]);
}

function renderPoliceLoadingState() {
  if (countEl) countEl.textContent = "Laddar...";
  if (filterCountEl) filterCountEl.textContent = "Laddar...";
  if (countEl2) countEl2.textContent = "…";
  if (empty) empty.hidden = true;

  if (grid) {
    grid.innerHTML = `
      <article class="event-card police-card">
        <div class="event-body">
          <h3 class="event-title">Hämtar polisens händelser…</h3>
          <p class="event-desc">Detta kan ta några sekunder.</p>
        </div>
      </article>
    `;
  }
}

function sortPoliceEvents(list) {
  return [...(list || [])].sort((a, b) => {
    const aDate = parsePoliceDateTime(a?.datetime);
    const bDate = parsePoliceDateTime(b?.datetime);

    if (!aDate && !bDate) return 0;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate.getTime() - aDate.getTime();
  });
}

async function fetchPoliceEventsFrom(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("Ogiltigt API-svar");
  }

  return data;
}

async function loadPoliceEvents(force = false) {
  if (policeEventsLoaded && !force) return policeEvents;

  const sources = [POLICE_EVENTS_URL, POLICE_EVENTS_PROXY_URL];
  let lastErr = null;

  for (const source of sources) {
    try {
      const raw = await fetchPoliceEventsFrom(source);
      policeEvents = sortPoliceEvents(raw.map(normalizePoliceEvent).filter(Boolean));
      policeEventsLoaded = true;
      policeEventsError = "";
      return policeEvents;
    } catch (err) {
      lastErr = err;
    }
  }

  policeEvents = [];
  policeEventsLoaded = false;
  policeEventsError = lastErr?.message || "Kunde inte hämta polisnotiser.";
  throw lastErr || new Error(policeEventsError);
}

async function setPoliceMode(nextActive) {
  policeModeActive = !!nextActive;
  updateFeedModeUi();

  if (!policeModeActive) {
    setSelectedEvent(null);
    applyFilters();
    return;
  }

  if (policeEventsLoading) return;

  policeEventsLoading = true;
  if (policeToggleEl) policeToggleEl.disabled = true;
  renderPoliceLoadingState();

  try {
    await loadPoliceEvents();
    renderPoliceList(policeEvents);
  } catch {
    renderPoliceList([], policeEventsError || "Kunde inte hämta polisnotiser.");
  } finally {
    policeEventsLoading = false;
    if (policeToggleEl) policeToggleEl.disabled = false;
    updateFeedModeUi();
  }
}

function hashNumber(input) {
  const str = String(input || "");
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function markerPosition(id) {
  const h = hashNumber(id);
  const x = 10 + (h % 80);
  const y = 12 + ((h >> 7) % 76);
  return { x, y };
}

function renderMap(list) {
  if (!mapCanvasEl || !mapEventsEl) return;

  lastRenderedList = list || [];
  if (mapCountEl) mapCountEl.textContent = `${lastRenderedList.length}`;

  mapCanvasEl.querySelectorAll(".map-marker").forEach((el) => el.remove());

  if (!lastRenderedList.length) {
    mapEventsEl.innerHTML = `<li class="map-empty">Inga event att visa.</li>`;
    return;
  }

  const markers = lastRenderedList.slice(0, 24);
  for (const ev of markers) {
    const pos = markerPosition(ev.id);
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "map-marker";
    marker.style.left = `${pos.x}%`;
    marker.style.top = `${pos.y}%`;
    marker.dataset.eventId = String(ev.id);
    marker.setAttribute("aria-label", ev.title || "Event");
    marker.title = ev.title || "Event";
    if (selectedEventId && String(ev.id) === String(selectedEventId)) {
      marker.classList.add("is-selected");
    }
    mapCanvasEl.appendChild(marker);
  }

  mapEventsEl.innerHTML = lastRenderedList.map((ev) => {
    const dateText = fmtDateSv(ev.date);
    const endResolved = resolveEndTime(ev);
    const timeRange = ev.time
      ? (endResolved && endResolved !== "sent"
          ? `${fmtTime(ev.time)}–${fmtTime(endResolved)}`
          : (endResolved === "sent" ? `${fmtTime(ev.time)} • Sent` : fmtTime(ev.time)))
      : "";
    const placeMeta = buildPlaceMeta(ev.place);
    const meta = [dateText, timeRange, placeMeta.label].filter(Boolean).join(" • ");
    const metaSafe = safeText(meta);
    const titleSafe = safeText(ev.title || "Utan titel");
    const placeLink = placeMeta.href
      ? `<a class="map-item-link" href="${placeMeta.href}" target="_blank" rel="noopener noreferrer">Öppna karta</a>`
      : "";

    const isSelected = selectedEventId && String(ev.id) === String(selectedEventId);

    return `
      <li class="map-item ${isSelected ? "is-selected" : ""}" data-event-id="${ev.id}">
        <div class="map-item-title">${titleSafe}</div>
        ${meta ? `<div class="map-item-meta">${metaSafe}</div>` : ""}
        <div class="map-item-actions">
          <button class="map-item-btn" type="button" data-action="map-select" data-id="${ev.id}">Visa detaljer</button>
          ${placeLink}
        </div>
      </li>
    `;
  }).join("");
}

function updateMapSelection() {
  if (!mapCanvasEl) return;
  mapCanvasEl.querySelectorAll(".map-marker").forEach((marker) => {
    const isSelected = selectedEventId && marker.dataset.eventId === String(selectedEventId);
    marker.classList.toggle("is-selected", !!isSelected);
  });

  if (mapEventsEl) {
    mapEventsEl.querySelectorAll(".map-item").forEach((item) => {
      const isSelected = selectedEventId && item.dataset.eventId === String(selectedEventId);
      item.classList.toggle("is-selected", !!isSelected);
    });
  }
}

function renderList(list, emptyLabel = "") {
  lastRenderedList = list || [];
  if (emptyCtaEl) emptyCtaEl.hidden = false;
  const count = list.length;
  if (countEl) countEl.textContent = `${count} händelser`;
  if (filterCountEl) filterCountEl.textContent = `${count} händelser`;
  if (countEl2) countEl2.textContent = `${count}`;

  if (count === 0) {
    if (grid) grid.innerHTML = "";
    if (emptyMsgEl) {
      emptyMsgEl.textContent = emptyLabel || (activeCategory === "Alla"
        ? "Inga händelser ännu. Var först med att lägga upp en!"
        : `Inga händelser i kategorin “${activeCategory}”.`);
    }
    if (empty) empty.hidden = false;
    updateSavedList();
    renderMap(list);
    return;
  }

  if (empty) empty.hidden = true;
  if (grid) grid.innerHTML = list.map(renderEvent).join("");
  updateCardStates();
  updateSavedList();
  renderMap(list);
}

function updateCardStates() {
  if (!grid) return;
  const selectedId = selectedEventId ? String(selectedEventId) : "";
  grid.querySelectorAll(".event-card").forEach((card) => {
    const id = String(card.dataset.eventId || "");
    card.classList.toggle("is-selected", !!selectedId && id === selectedId);
    card.classList.toggle("is-saved", isSavedEvent(id));
  });
  updateMapSelection();
}

function updateSavedList() {
  if (!savedListEl) return;

  const savedEvents = [];
  const presentIds = new Set();
  for (const ev of allEvents || []) {
    if (isSavedEvent(ev.id)) {
      savedEvents.push(ev);
      presentIds.add(String(ev.id));
    }
  }

  if (presentIds.size !== savedEventIds.size) {
    savedEventIds = new Set([...presentIds]);
    persistSavedToStorage();
  }

  if (!savedEvents.length) {
    savedListEl.innerHTML = `<li class="saved-empty">Inga sparade ännu.</li>`;
    return;
  }

  savedListEl.innerHTML = savedEvents.map((ev) => {
    const dateText = fmtDateSv(ev.date);
    const endResolved = resolveEndTime(ev);
    const timeRange = ev.time
      ? (endResolved && endResolved !== "sent"
          ? `${fmtTime(ev.time)}–${fmtTime(endResolved)}`
          : (endResolved === "sent" ? `${fmtTime(ev.time)} • Sent` : fmtTime(ev.time)))
      : "";
    const meta = [dateText, timeRange].filter(Boolean).join(" • ");
    return `
      <li class="saved-item" data-event-id="${ev.id}">
        <button class="saved-open" type="button" data-action="open-saved">${safeText(ev.title || "Utan titel")}</button>
        <div class="saved-meta">
          <span>${safeText(meta || "Ingen tid angiven")}</span>
          <button class="saved-remove" type="button" data-action="remove-saved">Ta bort</button>
        </div>
      </li>
    `;
  }).join("");
}

function buildDetailsMarkup(ev) {
  if (!ev) return `<p class="details-empty">Välj ett event i listan för att se mer här.</p>`;

  const imgs = ev.image_urls || [];
  const firstImg = imgs.length ? imgs[0] : null;
  const titleSafe = safeText(ev.title || "Utan titel");
  const dateText = fmtDateSv(ev.date) || "";
  const endResolved = resolveEndTime(ev);
  const timeRange = ev.time
    ? (endResolved && endResolved !== "sent"
        ? `${fmtTime(ev.time)}–${fmtTime(endResolved)}`
        : (endResolved === "sent" ? `${fmtTime(ev.time)} • Sent` : fmtTime(ev.time)))
    : "";
  const placeMeta = buildPlaceMeta(ev.place);
  const categoryLabel = normalizeCategory(ev.category);
  const categorySafe = safeText(categoryLabel);
  const priceLabel = formatPriceLabel(ev.price);
  const priceSafe = safeText(priceLabel);
  const freePrice = isFreePrice(ev.price);
  const authorName = authorNameFromProfile(ev.profiles, "Användare");
  const authorSafe = safeText(authorName);
  const authorProfileHref = ev.user_id ? `html/Profil.html?uid=${encodeURIComponent(ev.user_id)}` : "";
  const desc = String(ev.info || "").trim();
  const descSafe = safeText(desc);
  const isSaved = isSavedEvent(ev.id);

  return `
    ${firstImg ? `
      <div class="details-hero">
        <img src="${firstImg}" alt="${titleSafe}" loading="lazy">
      </div>
    ` : `
      <div class="details-hero">
        <div class="event-media-placeholder">Ingen bild</div>
      </div>
    `}

    <div class="details-badges">
      ${categoryLabel ? `<span class="event-badge cat" data-category="${categoryLabel}">${categorySafe}</span>` : ""}
      ${priceLabel ? `<span class="event-badge price ${freePrice ? "is-free" : ""}">${priceSafe}</span>` : ""}
    </div>

    <h3 class="details-title">${titleSafe}</h3>

    <div class="details-meta">
      ${dateText ? `<div>Datum: ${dateText}</div>` : ""}
      ${timeRange ? `<div>Tid: ${timeRange}</div>` : ""}
      ${placeMeta.label ? `<div>Plats: <a href="${placeMeta.href}" target="_blank" rel="noopener noreferrer">${safeText(placeMeta.label)}</a></div>` : ""}
      <div>Skapare: ${authorProfileHref ? `<a href="${authorProfileHref}">${authorSafe}</a>` : authorSafe}</div>
    </div>

    ${desc ? `<p class="details-desc">${descSafe}</p>` : ""}

    <div class="details-actions">
      <button class="details-btn" data-action="details-save" data-id="${ev.id}">
        ${isSaved ? "Ta bort" : "Spara"}
      </button>
      ${placeMeta.label ? `<a class="details-btn ghost" href="${placeMeta.href}" target="_blank" rel="noopener noreferrer">Öppna karta</a>` : ""}
      <button class="details-btn danger" data-action="details-report" data-id="${ev.id}">Rapportera</button>
    </div>
  `;
}

function setSelectedEvent(ev) {
  selectedEventId = ev ? String(ev.id) : null;
  if (detailsContentEl) {
    detailsContentEl.dataset.eventId = selectedEventId || "";
    detailsContentEl.innerHTML = buildDetailsMarkup(ev);
  }
  updateCardStates();
  updateMapSelection();
}

function syncSelectedEvent() {
  if (!selectedEventId) {
    if (detailsContentEl && !detailsContentEl.innerHTML.trim()) {
      detailsContentEl.innerHTML = buildDetailsMarkup(null);
    }
    return;
  }
  const ev = allEvents.find((item) => String(item.id) === String(selectedEventId));
  if (!ev) {
    setSelectedEvent(null);
    return;
  }
  setSelectedEvent(ev);
}

function renderFilters() {
  if (!filterPillsEl) return;
  filterPillsEl.innerHTML = CATEGORY_OPTIONS.map((cat) => `
    <button class="filter-pill ${cat === activeCategory ? "is-active" : ""}" data-category="${cat}" type="button">
      ${cat}
    </button>
  `).join("");
}

function renderDateFilters() {
  if (!datePillsEl) return;
  datePillsEl.innerHTML = DATE_OPTIONS.map((range) => `
    <button class="filter-pill ${range === activeDateRange ? "is-active" : ""}" data-date="${range}" type="button">
      ${range}
    </button>
  `).join("");
}

function setActiveCategory(cat) {
  if (!CATEGORY_OPTIONS.includes(cat)) cat = "Alla";
  activeCategory = cat;
  if (filterPillsEl) {
    filterPillsEl.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.category === activeCategory);
    });
  }
  applyFilters();
}

function setActiveDateRange(range) {
  if (!DATE_OPTIONS.includes(range)) range = "Alla";
  activeDateRange = range;
  if (datePillsEl) {
    datePillsEl.querySelectorAll(".filter-pill").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.date === activeDateRange);
    });
  }
  applyFilters();
}

function setActiveSort(sort) {
  if (!SORT_OPTIONS.includes(sort)) sort = "Senast";
  activeSort = sort;
  if (sortSelectEl) sortSelectEl.value = activeSort;
  applyFilters();
}

function resetFilters() {
  policeModeActive = false;
  updateFeedModeUi();
  activeCategory = "Alla";
  activeDateRange = "Alla";
  activeSort = "Senast";
  renderFilters();
  renderDateFilters();
  if (sortSelectEl) sortSelectEl.value = activeSort;
  clearSearchInputs();
  applyFilters();
}

function filterByDate(list) {
  if (activeDateRange === "Alla") return list;
  const now = new Date();
  let range = null;

  if (activeDateRange === "Idag") {
    range = { start: startOfDay(now), end: endOfDay(now) };
  } else if (activeDateRange === "Denna vecka") {
    range = { start: weekStart(now), end: weekEnd(now) };
  } else if (activeDateRange === "Helgen") {
    range = weekendRange(now);
  }

  if (!range) return list;

  return (list || []).filter((ev) => {
    const dt = eventStartAsDate(ev);
    if (!dt) return false;
    return dt >= range.start && dt <= range.end;
  });
}

function filterBySearch(list) {
  const q = normalizeText(searchQuery);
  const p = normalizeText(searchPlace);

  if (!q && !p) return list;

  return (list || []).filter((ev) => {
    if (q) {
      const hay = normalizeText([
        ev.title,
        ev.info,
        ev.category,
        ev?.profiles?.full_name,
        ev?.profiles?.username
      ].filter(Boolean).join(" "));
      if (!hay.includes(q)) return false;
    }

    if (p) {
      const placeRaw = normalizeText(ev.place || "");
      const placeLabel = normalizeText(extractPlaceLabelFromUrl(normalizeMapsUrl(ev.place)));
      if (!placeRaw.includes(p) && !placeLabel.includes(p)) return false;
    }

    return true;
  });
}

function sortEvents(list) {
  const sorted = [...(list || [])];

  if (activeSort === "Populärast") {
    sorted.sort((a, b) => {
      const diff = (b.att_count || 0) - (a.att_count || 0);
      if (diff !== 0) return diff;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return sorted;
  }

  if (activeSort === "Snart") {
    sorted.sort((a, b) => {
      const aDate = eventStartAsDate(a);
      const bDate = eventStartAsDate(b);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      if (diff !== 0) return diff;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    return sorted;
  }

  sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return sorted;
}

function applyFilters() {
  if (policeModeActive) {
    renderFeatured([]);
    renderPoliceList(policeEvents, policeEventsError);
    return;
  }

  let list = activeCategory === "Alla"
    ? allEvents
    : allEvents.filter((ev) => normalizeCategory(ev.category) === activeCategory);

  if (searchDate) {
    list = (list || []).filter((ev) => eventDateKey(ev) === searchDate);
  } else {
    list = filterByDate(list);
  }
  list = filterBySearch(list);
  list = sortEvents(list);
  renderFeatured(allEvents);
  renderList(list);
}

function syncSearchState() {
  searchQuery = normalizeText(searchWhatEl?.value);
  searchPlace = normalizeText(searchWhereEl?.value);
  searchDate = searchWhenEl?.value ? String(searchWhenEl.value) : "";
}

function applySearchFromInputs(shouldScroll = false) {
  syncSearchState();
  applyFilters();
  if (shouldScroll) {
    const section = document.getElementById("events");
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setDateInputEmpty() {
  if (!searchWhenEl) return;
  const placeholder = searchWhenEl.dataset.placeholder || "Välj datum";
  if (!searchWhenEl.value) {
    searchWhenEl.type = "text";
    searchWhenEl.placeholder = placeholder;
  }
}

function setupDateInput() {
  if (!searchWhenEl) return;
  const placeholder = searchWhenEl.dataset.placeholder || "Välj datum";

  const setDateMode = () => {
    if (searchWhenEl.type !== "date") searchWhenEl.type = "date";
    searchWhenEl.placeholder = "";
  };

  const setTextModeIfEmpty = () => {
    if (!searchWhenEl.value) {
      searchWhenEl.type = "text";
      searchWhenEl.placeholder = placeholder;
    }
  };

  searchWhenEl.addEventListener("focus", setDateMode);
  searchWhenEl.addEventListener("click", setDateMode);
  searchWhenEl.addEventListener("blur", setTextModeIfEmpty);

  setTextModeIfEmpty();
}

function clearSearchInputs() {
  if (searchWhatEl) searchWhatEl.value = "";
  if (searchWhereEl) searchWhereEl.value = "";
  if (searchWhenEl) {
    searchWhenEl.value = "";
    setDateInputEmpty();
  }
  searchQuery = "";
  searchPlace = "";
  searchDate = "";
}

/* =========================
   Filter: visa inte passerade events
========================= */
function filterOutPassedEvents(list) {
  const now = new Date();
  return (list || []).filter((ev) => {
    const end = eventEndAsDate(ev);
    if (!end) return true;
    return end.getTime() >= now.getTime();
  });
}

/* =========================
   Main load
========================= */
async function loadEvents() {
  if (!grid || !empty || !countEl) return;

  grid.innerHTML = `<p>Laddar...</p>`;
  empty.hidden = true;
  countEl.textContent = "";

  // 1) Försök join
  const res = await loadEventsWithJoin();

  let list = [];

  // 2) Fallback om join failar
  if (res.error) {
    console.warn("⚠️ Join misslyckades, kör fallback:", res.error.message);

    const base = await loadEventsNoJoin();
    if (base.error) {
      console.error("❌ Kunde inte ladda events:", base.error);
      grid.innerHTML = `<p>Kunde inte ladda händelser.</p>`;
      empty.hidden = true;
      return;
    }

    list = base.data || [];
    const ids = [...new Set(list.map((e) => e.user_id).filter(Boolean))];
    const profilesMap = await loadProfilesForUserIds(ids);
    for (const e of list) e.profiles = profilesMap.get(e.user_id) || null;
  } else {
    list = res.data || [];

    // Ibland (p.g.a. RLS eller join-begränsningar) kan `profiles` vara null
    // även om `user_id` finns. Hämta saknade profiles separat som fallback.
    const missingUserIds = [...new Set((list || [])
      .filter((e) => !e.profiles && e.user_id)
      .map((e) => e.user_id))];

    if (missingUserIds.length) {
      const profilesMap = await loadProfilesForUserIds(missingUserIds);
      for (const e of list) {
        if (!e.profiles && e.user_id) e.profiles = profilesMap.get(e.user_id) || null;
      }
    }
  }

  // 3) filtrera bort passerade
  list = filterOutPassedEvents(list);

  // 4) “kommer”-meta
  const eventIds = list.map((e) => e.id).filter(Boolean);
  const { counts, mine } = await fetchAttendeesMeta(eventIds);

  for (const e of list) {
    e.att_count = counts.get(e.id) || 0;
    e.i_am_coming = mine.has(e.id);
  }

  allEvents = list;
  applyFilters();
  syncSelectedEvent();
}

/* =========================
   Click handlers
========================= */
function wireEvents() {
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    const actionBtn = e.target.closest("[data-action]");
    const card = e.target.closest(".event-card");
    const eventId = card?.dataset?.eventId;
    if (!card || !eventId) return;

    if (!actionBtn) {
      if (e.target.closest("a, button")) return;
      const ev = allEvents.find((item) => String(item.id) === String(eventId));
      if (ev) setSelectedEvent(ev);
      return;
    }

    const action = actionBtn.dataset.action;

    if (action === "toggle-desc") {
      const descEl = card?.querySelector(".event-desc");
      if (!descEl) return;

      const isCollapsed = descEl.dataset.collapsed === "true";
      const shortText = descEl.dataset.short || "";
      const fullText = descEl.dataset.full || "";

      if (isCollapsed) {
        descEl.textContent = fullText;
        descEl.dataset.collapsed = "false";
        actionBtn.textContent = "Visa mindre";
        actionBtn.setAttribute("aria-expanded", "true");
      } else {
        descEl.textContent = shortText;
        descEl.dataset.collapsed = "true";
        actionBtn.textContent = "Visa mer";
        actionBtn.setAttribute("aria-expanded", "false");
      }
      return;
    }

    // ✅ Jag kommer / ⛔ Avbryt
    if (action === "toggle-attend") {
      const isOn = actionBtn.classList.contains("is-on");
      const nowOn = !isOn;

      const ownerId = card?.dataset?.ownerId || "";
      const isOwner = !!currentUserId && ownerId === currentUserId;

      if (isOwner && isOn) {
        alert("Som ägare är du alltid anmäld till ditt event.");
        return;
      }

      // optimistisk UI (känns snabb)
      actionBtn.classList.toggle("is-on", nowOn);
      actionBtn.classList.toggle("is-off", !nowOn);
      actionBtn.textContent = nowOn ? "⛔ Avbryt" : "✅ Jag kommer";

      const statusEl = card.querySelector(".attend-status");
      if (statusEl) {
        statusEl.classList.toggle("is-on", nowOn);
        statusEl.classList.toggle("is-off", !nowOn);
        statusEl.textContent = nowOn ? "Du är anmäld" : "Inte anmäld";
      }
      card.classList.toggle("is-attending", nowOn);

      // DB
      const ok = await setAttend(eventId, nowOn);
      if (!ok) {
        // revert om fail
        actionBtn.classList.toggle("is-on", isOn);
        actionBtn.classList.toggle("is-off", !isOn);
        actionBtn.textContent = isOn ? "⛔ Avbryt" : "✅ Jag kommer";

        if (statusEl) {
          statusEl.classList.toggle("is-on", isOn);
          statusEl.classList.toggle("is-off", !isOn);
          statusEl.textContent = isOn ? "Du är anmäld" : "Inte anmäld";
        }
        card.classList.toggle("is-attending", isOn);
        return;
      }

      // uppdatera count
      const { counts } = await fetchAttendeesMeta([eventId]);
      const newCount = counts.get(eventId) || 0;
      const countSpan = card.querySelector(".attend-count");
      if (countSpan) countSpan.innerHTML = `${ICONS.users}<span>${fmtKommer(newCount)}</span>`;
      const targetEvent = allEvents.find((ev) => String(ev.id) === String(eventId));
      if (targetEvent) targetEvent.att_count = newCount;
      if (activeSort === "Populärast") applyFilters();

      if (isOwner && nowOn) {
        actionBtn.disabled = true;
        actionBtn.textContent = "Ägare";
        actionBtn.title = "Som ägare är du alltid anmäld";
      }

      return;
    }

    // �️ Ta bort event (endast ägare eller admin får lyckas på serversidan via RLS)
    if (action === "delete-event") {
      if (!confirm('Vill du verkligen ta bort denna händelse?')) return;
      try {
        const { error } = await supabase.from("events").delete().eq("id", eventId);
        if (error) {
          alert("Kunde inte ta bort: " + (error.message || error));
          return;
        }
        allEvents = (allEvents || []).filter((e) => String(e.id) !== String(eventId));
        if (selectedEventId === String(eventId)) {
          setSelectedEvent(null);
        }
        if (isSavedEvent(eventId)) {
          toggleSavedEvent(eventId);
        }
        applyFilters();
      } catch (err) {
        alert("Kunde inte ta bort: " + (err?.message || err));
      }
      return;
    }

    // �📋 Visa lista
    if (action === "show-attendees") {
      try {
        openAttendeesModal(`<p>Laddar deltagare...</p>`);
        const rows = await fetchAttendeesList(eventId);

        if (!rows.length) {
          openAttendeesModal(`<p>Ingen har anmält sig ännu.</p>`);
          return;
        }

        const html = `
          <ul class="att-list">
            ${rows.map((r) => `<li class="att-item">${displayName(r.profiles)}</li>`).join("")}
          </ul>
        `;
        openAttendeesModal(html);
      } catch (err) {
        console.warn("⚠️ Kunde inte ladda lista:", err?.message || err);
        openAttendeesModal(`<p>Kunde inte ladda deltagarlistan.</p>`);
      }
    }
  });
}

function wireFilters() {
  if (!filterPillsEl) return;
  filterPillsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-pill");
    if (!btn) return;
    setActiveCategory(btn.dataset.category || "Alla");
  });
}

function wireCategoryCards() {
  const cards = Array.from(document.querySelectorAll(".category-card[data-category]"));
  if (!cards.length) return;

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      const cat = card.dataset.category || "Alla";
      setActiveCategory(cat);
      const section = document.getElementById("events");
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function wireSearch() {
  if (searchBtnEl) {
    searchBtnEl.addEventListener("click", () => applySearchFromInputs(true));
  }

  const handleEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      applySearchFromInputs(true);
    }
  };

  if (searchWhatEl) {
    searchWhatEl.addEventListener("keydown", handleEnter);
    searchWhatEl.addEventListener("input", () => {
      clearTimeout(searchWhatEl._timer);
      searchWhatEl._timer = setTimeout(() => applySearchFromInputs(false), 120);
    });
  }

  if (searchWhereEl) {
    searchWhereEl.addEventListener("keydown", handleEnter);
    searchWhereEl.addEventListener("input", () => {
      clearTimeout(searchWhereEl._timer);
      searchWhereEl._timer = setTimeout(() => applySearchFromInputs(false), 120);
    });
  }

  if (searchWhenEl) {
    searchWhenEl.addEventListener("keydown", handleEnter);
    searchWhenEl.addEventListener("change", () => applySearchFromInputs(false));
  }
}

function wireFeatured() {
  if (!featuredGridEl) return;

  featuredGridEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action=\"featured-open\"]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    const ev = allEvents.find((item) => String(item.id) === String(id));
    if (ev) {
      setSelectedEvent(ev);
      const card = grid?.querySelector(`.event-card[data-event-id="${String(id)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

function setBoardView(view) {
  activeView = view === "map" ? "map" : "list";
  if (listViewEl) listViewEl.hidden = activeView !== "list";
  if (mapViewEl) mapViewEl.hidden = activeView !== "map";

  viewToggleEls.forEach((btn) => {
    const isActive = btn.dataset.view === activeView;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  if (activeView === "map") renderMap(lastRenderedList);
}

function wireViewToggle() {
  if (!viewToggleEls.length) return;
  viewToggleEls.forEach((btn) => {
    btn.addEventListener("click", () => {
      setBoardView(btn.dataset.view || "list");
    });
  });
}

function wireMap() {
  if (mapCanvasEl) {
    mapCanvasEl.addEventListener("click", (e) => {
      const marker = e.target.closest(".map-marker");
      if (!marker) return;
      const id = marker.dataset.eventId;
      const ev = allEvents.find((item) => String(item.id) === String(id));
      if (ev) setSelectedEvent(ev);
    });
  }

  if (mapEventsEl) {
    mapEventsEl.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const btn = e.target.closest("[data-action]");
      const item = e.target.closest(".map-item");
      const id = btn?.dataset?.id || item?.dataset?.eventId;
      if (!id) return;
      const ev = allEvents.find((evItem) => String(evItem.id) === String(id));
      if (ev) setSelectedEvent(ev);
    });
  }
}

function wireDateFilters() {
  if (!datePillsEl) return;
  datePillsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".filter-pill");
    if (!btn) return;
    setActiveDateRange(btn.dataset.date || "Alla");
  });
}

function wireSort() {
  if (!sortSelectEl) return;
  sortSelectEl.addEventListener("change", () => {
    setActiveSort(sortSelectEl.value || "Senast");
  });
}

function wirePoliceToggle() {
  if (!policeToggleEl) return;
  policeToggleEl.addEventListener("click", async () => {
    await setPoliceMode(!policeModeActive);
  });
}

function wireClearFilters() {
  if (!clearFiltersBtn) return;
  clearFiltersBtn.addEventListener("click", () => {
    resetFilters();
  });
}

function wireDetailsActions() {
  if (!detailsContentEl) return;

  detailsContentEl.addEventListener("click", async (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const id = actionBtn.dataset.id;
    if (!id) return;

    if (action === "details-save") {
      toggleSavedEvent(id);
      updateSavedList();
      updateCardStates();
      const ev = allEvents.find((item) => String(item.id) === String(id));
      if (ev) setSelectedEvent(ev);
      return;
    }

    if (action === "details-report") {
      const reason = prompt("Vad vill du rapportera? (kort beskrivning)");
      const clean = reason ? reason.trim() : "";
      if (!clean) return;
      await reportEvent(id, clean);
      return;
    }
  });
}

function wireSavedList() {
  if (!savedListEl) return;

  savedListEl.addEventListener("click", (e) => {
    const actionBtn = e.target.closest("[data-action]");
    const item = e.target.closest(".saved-item");
    const eventId = item?.dataset?.eventId;
    if (!eventId) return;

    if (actionBtn?.dataset?.action === "remove-saved") {
      toggleSavedEvent(eventId);
      updateSavedList();
      updateCardStates();
      if (selectedEventId === String(eventId)) {
        const ev = allEvents.find((item) => String(item.id) === String(eventId));
        if (ev) setSelectedEvent(ev);
        else setSelectedEvent(null);
      }
      return;
    }

    const ev = allEvents.find((item) => String(item.id) === String(eventId));
    if (ev) {
      setSelectedEvent(ev);
      const card = grid?.querySelector(`.event-card[data-event-id="${String(eventId)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

/* =========================
   Boot
========================= */
(async () => {
  await loadCurrentUser();
  loadSavedFromStorage();
  ensureAttendeesModal();
  ensureAdminToggle();
  updateFeedModeUi();
  renderFilters();
  renderDateFilters();
  setupDateInput();
  if (sortSelectEl) sortSelectEl.value = activeSort;
  wireFilters();
  wireCategoryCards();
  wireSearch();
  wireFeatured();
  wireViewToggle();
  wireMap();
  wireDateFilters();
  wireSort();
  wirePoliceToggle();
  wireClearFilters();
  wireDetailsActions();
  wireSavedList();
  wireEvents();
  setBoardView(activeView);
  loadEvents();
})();

