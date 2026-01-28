// ../js/events.js
import { supabase } from "./supabaseClient.js";

const grid = document.getElementById("eventsGrid");
const empty = document.getElementById("eventsEmpty");
const countEl = document.getElementById("eventsCount");

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
  return String(t).slice(0, 5);
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
  return (
    profile?.full_name ||
    profile?.username ||
    fallback
  );
}

function renderEvent(ev) {
  const imgs = ev.image_urls || [];
  const firstImg = imgs.length ? imgs[0] : null;

  // join kan ge ev.profiles som objekt (eller null)
  const authorName = authorNameFromProfile(ev.profiles, "Användare");
  const initials = initialsFrom(authorName);

  const timeText = ev.time ? `🕒 ${fmtTime(ev.time)}` : "";
  const endText = ev.end_time ? `⏳ ${ev.end_time === "sent" ? "Sent" : fmtTime(ev.end_time)}` : "";

  return `
    <article class="event-card">
      ${
        firstImg
          ? `<div class="event-image">
               <img src="${firstImg}" alt="Event bild" loading="lazy">
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
          <li>📅 ${ev.date || ""}</li>
          ${timeText ? `<li>${timeText}</li>` : ""}
          ${endText ? `<li>${endText}</li>` : ""}
        </ul>

        ${ev.info ? `<p class="event-desc">${ev.info}</p>` : ""}

        ${
          imgs.length > 1
            ? `<div class="event-more">+${imgs.length - 1} fler bilder</div>`
            : ""
        }
      </div>
    </article>
  `;
}

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
    console.warn("⚠️ profiles lookup failed:", error.message);
    return new Map();
  }

  const map = new Map();
  for (const p of data || []) map.set(p.id, p);
  return map;
}

async function loadEvents() {
  if (!grid || !empty || !countEl) return;

  grid.innerHTML = `<p>Laddar...</p>`;
  empty.hidden = true;
  countEl.textContent = "";

  console.log("📂 Loading events feed...");

  // 1) Försök join
  let res = await loadEventsWithJoin();

  // 2) Om join failar: fallback till två queries
  if (res.error) {
    console.warn("⚠️ Join query failed, using fallback:", res.error.message);

    const base = await loadEventsNoJoin();
    if (base.error) {
      console.error("loadEvents base query failed:", base.error);
      grid.innerHTML = `<p>Kunde inte ladda händelser.</p>`;
      empty.hidden = true;
      return;
    }

    const list = base.data || [];
    const ids = [...new Set(list.map((e) => e.user_id).filter(Boolean))];
    const profilesMap = await loadProfilesForUserIds(ids);

    // attach profiles object so renderEvent funkar samma
    for (const e of list) e.profiles = profilesMap.get(e.user_id) || null;

    renderList(list);
    return;
  }

  // join lyckades
  renderList(res.data || []);
}

function renderList(list) {
  console.log("✅ Loaded", list.length, "events");
  countEl.textContent = `${list.length} händelser`;

  if (list.length === 0) {
    grid.innerHTML = "";
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  grid.innerHTML = list.map(renderEvent).join("");
}

loadEvents();
