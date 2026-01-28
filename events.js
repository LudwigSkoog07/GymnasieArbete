import { supabase } from "./supabaseClient.js";

const grid = document.getElementById("eventsGrid");
const count = document.getElementById("eventsCount");
const empty = document.getElementById("eventsEmpty");

function initials(name = "Anonym") {
  return name
    .split(" ")
    .filter(Boolean)
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeAgo(isoString) {
  if (!isoString) return "nyss";
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now - then;

  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "nyss";
  if (min < 60) return `${min} min sedan`;

  const h = Math.floor(min / 60);
  if (h < 24) return `${h} timmar sedan`;

  const d = Math.floor(h / 24);
  return `${d} dagar sedan`;
}

function formatDate(dateStr) {
  // "YYYY-MM-DD" -> "15 juni" (sv)
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

function formatTime(timeStr) {
  // "HH:MM:SS" eller "HH:MM" -> "HH:MM"
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

function render(events) {
  grid.innerHTML = "";

  events.forEach(e => {
    const author = e.author || "Anonym";

    grid.innerHTML += `
      <article class="event-card">
        <div class="event-top">
          <div class="event-avatar" aria-hidden="true">${initials(author)}</div>
          <div class="event-who">
            <div class="event-author">${author}</div>
            <div class="event-timeago">${timeAgo(e.created_at)}</div>
          </div>
        </div>

        <h3 class="event-name">${e.title}</h3>

        <ul class="event-meta" aria-label="Eventinfo">
          <li>📍 ${e.place}</li>
          <li>📅 ${formatDate(e.date)}</li>
          ${e.time ? `<li>⏰ ${formatTime(e.time)}</li>` : ``}
        </ul>

        ${e.info ? `<p class="event-desc">${e.info}</p>` : ``}
      </article>
    `;
  });

  count.textContent = `${events.length} händelser`;
  if (empty) empty.hidden = events.length !== 0;
}

async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("id, created_at, title, place, date, time, info, author")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    render([]);
    return;
  }

  render(data || []);
}

loadEvents();
