// ../js/events.js
import { supabase } from "./supabaseClient.js";

/* =========================
   DOM
========================= */
const grid = document.getElementById("eventsGrid");
const empty = document.getElementById("eventsEmpty");
const countEl = document.getElementById("eventsCount");

/* =========================
   State
========================= */
let currentUserId = null;

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

function fmtKommer(count) {
  if (count === 1) return "1 st kommer";
  return `${count} st kommer`;
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
    .select(`user_id, profiles:user_id ( id, username, full_name, avatar_url )`)
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
   Data: Events + profiles join/fallback
========================= */
async function loadEventsWithJoin() {
  return await supabase
    .from("events")
    .select(`
      id, created_at, title, place, date, time, end_time, info, image_urls, user_id,
      profiles:user_id ( id, username, full_name, avatar_url )
    `)
    .order("created_at", { ascending: false });
}

async function loadEventsNoJoin() {
  return await supabase
    .from("events")
    .select("id, created_at, title, place, date, time, end_time, info, image_urls, user_id")
    .order("created_at", { ascending: false });
}

async function loadProfilesForUserIds(userIds) {
  if (!userIds.length) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .in("id", userIds);

  if (error) {
    console.warn("⚠️ profiles lookup misslyckades:", error.message);
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

  const timeText = ev.time ? `🕒 ${fmtTime(ev.time)}` : "";
  const endResolved = resolveEndTime(ev);
  const endText = ev.end_time
    ? `⏳ ${endResolved === "sent" ? "Sent" : (endResolved ? fmtTime(endResolved) : "")}`
    : "";

  const attCount = ev.att_count || 0;
  const iAmComing = !!ev.i_am_coming;

  return `
    <article class="event-card ${iAmComing ? "is-attending" : ""}" data-event-id="${ev.id}">
      ${
        firstImg
          ? `<div class="event-image">
               <img src="${firstImg}" alt="Eventbild" loading="lazy">
             </div>`
          : ""
      }

      <div class="event-body">
        <div class="event-top">
          <div class="event-avatar">${initials}</div>
          <div>
            <div class="event-author">${authorName}</div>
            <div class="event-timeago">${timeAgo(ev.created_at)}</div>
          </div>
        </div>

        <h3 class="event-name">${ev.title || ""}</h3>

        <ul class="event-meta">
          <li>📍 ${ev.place || ""}</li>
          <li>📅 ${fmtDateSv(ev.date) || ""}</li>
          ${timeText ? `<li>${timeText}</li>` : ""}
          ${endText ? `<li>${endText}</li>` : ""}
        </ul>

        ${ev.info ? `<p class="event-desc">${ev.info}</p>` : ""}

        <div class="event-attend">
          <div class="attend-left">
            <button
  class="attend-btn ${iAmComing ? "is-on" : "is-off"}"
  data-action="toggle-attend"
  type="button"
  ${currentUserId ? "" : "disabled"}
  title="${currentUserId ? "" : "Logga in för att anmäla dig"}"
>
  ${iAmComing ? "⛔ Avbryt" : "✅ Jag kommer"}
</button>


            <span class="attend-status ${iAmComing ? "is-on" : "is-off"}">
              ${iAmComing ? "Du är anmäld" : "Inte anmäld"}
            </span>
          </div>

          <div class="attend-meta">
            <span class="attend-count">${fmtKommer(attCount)}</span>
            <button class="attend-list" data-action="show-attendees" type="button">
              Visa lista
            </button>
          </div>
        </div>

        ${
          imgs.length > 1
            ? `<div class="event-more">+${imgs.length - 1} fler bilder</div>`
            : ""
        }
      </div>
    </article>
  `;
}

function renderList(list) {
  countEl.textContent = `${list.length} händelser`;

  if (list.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  grid.innerHTML = list.map(renderEvent).join("");
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

  renderList(list);
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
      if (countSpan) countSpan.textContent = fmtKommer(newCount);

      return;
    }

    // 📋 Visa lista
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

/* =========================
   Boot
========================= */
(async () => {
  await loadCurrentUser();
  ensureAttendeesModal();
  wireEvents();
  loadEvents();
})();
