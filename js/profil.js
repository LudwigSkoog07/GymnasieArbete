import { supabase } from "./supabaseClient.js";
import { requireLogin } from "./guard.js";

const metaEl = document.querySelector(".profil-meta");
const myEventsEl = document.getElementById("myEvents");
const myEmptyEl = document.getElementById("myEmpty");

const aboutEl = document.getElementById("aboutMe");
const nameEl = document.getElementById("profileName");

const avatarImg = document.getElementById("avatarImg");
const avatarInput = document.getElementById("avatarInput");
const avatarFallback = document.querySelector(".avatar-fallback");

const logoutBtn = document.getElementById("logoutBtn");

const AVATAR_BUCKET = "avatars";

function fmtTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5); // "13:00:00" -> "13:00"
}
function fmtDate(d) {
  return d || "";
}

function setAvatar(url, fallbackText) {
  if (avatarFallback) avatarFallback.textContent = fallbackText || "??";

  if (!avatarImg) return;

  if (url) {
    avatarImg.src = url;
    avatarImg.style.display = "block";
    if (avatarFallback) avatarFallback.style.display = "none";
  } else {
    avatarImg.removeAttribute("src");
    avatarImg.style.display = "none";
    if (avatarFallback) avatarFallback.style.display = "inline";
  }
}

function safeExt(fileName) {
  const ext = (fileName?.split(".").pop() || "jpg").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

async function ensureProfileRow(user) {
  const username = user.email?.split("@")[0] || "User";

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id" });

  if (error) throw error;
}

async function loadProfile(user) {
  await ensureProfileRow(user);

  const { data, error } = await supabase
    .from("profiles")
    .select("username, about, avatar_url")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  const username = data?.username || (user.email?.split("@")[0] || "User");
  if (nameEl) nameEl.textContent = username;

  if (aboutEl) aboutEl.value = data?.about || "";

  const initials = username.slice(0, 2).toUpperCase();
  setAvatar(data?.avatar_url || null, initials);
}

async function saveAbout(user) {
  if (!aboutEl) return;

  const about = aboutEl.value || "";

  const { error } = await supabase
    .from("profiles")
    .update({ about, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) console.error(error);
}

async function uploadAvatar(user, file) {
  const ext = safeExt(file.name);
  const path = `${user.id}/avatar.${ext}`; // samma fil varje gång => overwrite

  const { error: upErr } = await supabase
    .storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  // Spara URL i profiles
  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (dbErr) throw dbErr;

  return publicUrl;
}

function renderCard(ev) {
  const imgs = ev.image_urls || [];
  const first = imgs.length ? imgs[0] : null;

  const timeText = ev.time ? `🕒 ${fmtTime(ev.time)}` : "";
  const endText = ev.end_time ? ` ⏳ ${ev.end_time === "sent" ? "Sent" : ev.end_time}` : "";

  return `
    <article class="my-card">
      <div class="my-top">
        <div class="my-img">
          ${first ? `<img src="${first}" alt="Event bild" loading="lazy">` : ``}
        </div>

        <div style="min-width:0;">
          <h3 class="my-title">${ev.title}</h3>
          <p class="my-meta">📍 ${ev.place} • 📅 ${fmtDate(ev.date)} ${timeText}${endText}</p>
        </div>
      </div>

      ${ev.info ? `<p class="my-desc">${ev.info}</p>` : ""}
    </article>
  `;
}

async function loadMyEvents(user) {
  // VIKTIGT: byt author från "Anonym" -> user.id (rekommenderat)
  // Om din events-tabell fortfarande använder author som text = "Anonym",
  // så måste du ändra laddaupp.js så author = user.id.
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("author", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    if (metaEl) metaEl.textContent = "Kunde inte ladda händelser.";
    return;
  }

  const count = data.length;
  if (metaEl) metaEl.textContent = `${count} publicerade händelser`;

  if (!myEventsEl) return;

  if (count === 0) {
    myEventsEl.innerHTML = "";
    if (myEmptyEl) myEmptyEl.style.display = "block";
    return;
  }

  if (myEmptyEl) myEmptyEl.style.display = "none";
  myEventsEl.innerHTML = data.map(renderCard).join("");
}

async function main() {
  const session = await requireLogin();
  const user = session.user;

  // Profil
  try {
    await loadProfile(user);
  } catch (e) {
    console.error(e);
    if (nameEl) nameEl.textContent = "Kunde inte ladda profil";
  }

  // About: debounce spara i DB
  if (aboutEl) {
    let t;
    aboutEl.addEventListener("input", () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => saveAbout(user), 350);
    });
  }

  // Avatar upload
  avatarInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadAvatar(user, file);
      const username = (nameEl?.textContent || "User");
      setAvatar(url, username.slice(0, 2).toUpperCase());
    } catch (err) {
      console.error(err);
      alert("Kunde inte spara profilbild. Kolla bucket/policies.");
    }
  });

  // Logga ut
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "Auth.html";
  });

  // Mina events
  await loadMyEvents(user);
}

main();
