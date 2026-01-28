import { supabase } from "./supabaseClient.js";

const grid = document.getElementById("eventsGrid");
const empty = document.getElementById("eventsEmpty");
const countEl = document.getElementById("eventsCount");

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  const h = Math.floor(diff / 3600);

  if (h < 1) return "Nyss";
  if (h === 1) return "1 timme sedan";
  return `${h} timmar sedan`;
}

function renderEvent(ev) {
  const imgs = ev.image_urls || [];
  const firstImg = imgs.length > 0 ? imgs[0] : null;

  return `
    <article class="event-card">

      ${
        firstImg
          ? `<div class="event-image">
               <img src="${firstImg}" alt="Event bild">
             </div>`
          : ""
      }

      <div class="event-body">
        <div class="event-top">
          <div class="event-avatar">H</div>
          <div>
            <div class="event-author">${ev.author || "Anonym"}</div>
            <div class="event-timeago">${timeAgo(ev.created_at)}</div>
          </div>
        </div>

        <h3 class="event-name">${ev.title}</h3>

        <ul class="event-meta">
          <li>📍 ${ev.place}</li>
          <li>📅 ${ev.date}</li>
          ${
            ev.time
              ? `<li>🕒 ${ev.time.slice(0, 5)}</li>`
              : ""
          }
          ${
            ev.end_time
              ? `<li>⏳ ${ev.end_time === "sent" ? "Sent" : ev.end_time}</li>`
              : ""
          }
        </ul>

        ${
          ev.info
            ? `<p class="event-desc">${ev.info}</p>`
            : ""
        }

        ${
          imgs.length > 1
            ? `<div class="event-more">
                 +${imgs.length - 1} fler bilder
               </div>`
            : ""
        }
      </div>
    </article>
  `;
}

async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    grid.innerHTML = `<p>Kunde inte ladda events.</p>`;
    return;
  }

  countEl.textContent = `${data.length} händelser`;

  if (data.length === 0) {
    empty.hidden = false;
    return;
  }

  empty.hidden = true;
  grid.innerHTML = data.map(renderEvent).join("");
}

loadEvents();
