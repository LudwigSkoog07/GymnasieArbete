// ../js/events.js
import { supabase } from "./supabaseClient.js";

/* =========================
   DOM
========================= */
const grid = document.getElementById("eventsGrid");
const empty = document.getElementById("eventsEmpty");
const countEl = document.getElementById("eventsCount");
const filterPillsEl = document.getElementById("filterPills");
const filterCountEl = document.getElementById("filterCount");
const countEl2 = document.getElementById("eventsCount2");
const emptyMsgEl = empty?.querySelector("p");

/* =========================
   State
========================= */
let currentUserId = null;
let isCurrentUserAdmin = false;
let allEvents = [];
let activeCategory = "Alla";
let adminProfiles = [];
let adminUserSearch = "";
let adminProfilesError = false;
let adminExpandedIds = new Set();

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
  const safeName = displayName || "Användare";
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
  const adminBtnLabel = isAdmin ? (adminBtnDisabled ? "Endast ägaren" : "Ta bort admin") : "Gör admin";
  const adminBtnTitle = adminBtnDisabled ? "Endast ägaren kan ta bort admin" : "";

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
        <button class="admin-action-btn" data-action="admin-toggle-admin" data-id="${id}" data-is-admin="${isAdmin}" data-name="${label}" ${adminBtnDisabled ? "disabled" : ""} ${adminBtnTitle ? `title="${adminBtnTitle}"` : ""}>
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

    if (action === "admin-toggle-admin") {
      const id = actionBtn?.dataset?.id;
      const isAdmin = actionBtn?.dataset?.isAdmin === "true";
      const name = actionBtn?.dataset?.name || id;
      if (!id) return;
      if (isAdmin && !canDemoteAdmin()) {
        alert("Endast ägaren kan ta bort admin från andra admins.");
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

    const events = evRes.error ? (await loadEventsNoJoin()).data || [] : evRes.data || [];
    const profiles = profilesRes.error ? [] : profilesRes.data || [];
    adminProfiles = profiles;
    adminProfilesError = !!profilesRes.error;

    const eventsHtml = events.map(ev => {
      const author = authorNameFromProfile(ev.profiles, 'Användare');
      return `<li class="admin-event" style="padding:8px;border-bottom:1px solid #eee;">
        <strong>${ev.title || '(utan titel)'}</strong> — ${author} — ${fmtDateSv(ev.date)} 
        <button data-action="admin-delete-event" data-id="${ev.id}" style="margin-left:8px;">🗑️ Ta bort</button>
      </li>`;
    }).join('');

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
        <button class="admin-tab-btn" data-tab="users">Profiler</button>
      </div>
      <div data-admin-tab="events">
        <ul style="list-style:none;padding:0;margin:0;">${eventsHtml || '<li>Inga händelser</li>'}</ul>
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
function renderEvent(ev) {
  const imgs = ev.image_urls || [];
  const firstImg = imgs.length ? imgs[0] : null;

  const authorName = authorNameFromProfile(ev.profiles, "Användare");
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
  const desc = ev.info ? truncate(ev.info, 120) : "";
  const badge = profileBadgeMarkup(ev.profiles);
  const avatar = profileAvatarMarkup(ev.profiles, initials, authorName);

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

        ${desc ? `<p class="event-desc">${desc}</p>` : ""}

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
              <span class="event-host-name">${authorName}${badge}</span>
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

function renderList(list, emptyLabel = "") {
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
    return;
  }

  if (empty) empty.hidden = true;
  if (grid) grid.innerHTML = list.map(renderEvent).join("");
}

function renderFilters() {
  if (!filterPillsEl) return;
  filterPillsEl.innerHTML = CATEGORY_OPTIONS.map((cat) => `
    <button class="filter-pill ${cat === activeCategory ? "is-active" : ""}" data-category="${cat}" type="button">
      ${cat}
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

function applyFilters() {
  const list = activeCategory === "Alla"
    ? allEvents
    : allEvents.filter((ev) => normalizeCategory(ev.category) === activeCategory);
  renderList(list);
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
}

/* =========================
   Click handlers
========================= */
function wireEvents() {
  if (!grid) return;

  grid.addEventListener("click", async (e) => {
    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;

    const card = e.target.closest(".event-card");
    const eventId = card?.dataset?.eventId;
    if (!eventId) return;

    const action = actionBtn.dataset.action;

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

/* =========================
   Boot
========================= */
(async () => {
  await loadCurrentUser();
  ensureAttendeesModal();
  ensureAdminToggle();
  renderFilters();
  wireFilters();
  wireEvents();
  loadEvents();
})();

