/**
 * profil.js (rewritten v2)
 * - Username kan bara ändras via penna
 * - "Pending username" sparas lokalt vid sidbyte/refresh och syncas vid nästa load
 * - About autosave (debounce)
 * - Avatar upload + save avatar_url
 * - Mina events lista
 * - Logout
 */

import { supabase } from "./supabaseClient.js";
import { requireLogin } from "./guard.js";

/* =========================
   DOM
========================= */
const metaEl = document.getElementById("profileMeta");
const myEventsEl = document.getElementById("myEvents");
const myEmptyEl = document.getElementById("myEmpty");

const aboutEl = document.getElementById("aboutMe");
const nameEl = document.getElementById("profileName");
const badgeEl = document.getElementById("profileBadge");

const avatarImg = document.getElementById("avatarImg");
const avatarInput = document.getElementById("avatarInput");
const avatarFallback = document.getElementById("avatarFallback");

const logoutBtn = document.getElementById("logoutBtn");

// Username edit UI
const editNameBtn = document.getElementById("editNameBtn");
const nameEditor = document.getElementById("nameEditor");
const nameInput = document.getElementById("nameInput");
const saveNameBtn = document.getElementById("saveNameBtn");
const cancelNameBtn = document.getElementById("cancelNameBtn");
const nameHint = document.getElementById("nameHint");

const AVATAR_BUCKET = "avatars";

/* =========================
   Utils
========================= */
function fmtTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function initialsFrom(name) {
  const s = (name || "").trim();
  if (!s) return "??";
  return s.slice(0, 2).toUpperCase();
}

function safeExt(fileName) {
  const ext = (fileName?.split(".").pop() || "jpg").toLowerCase();
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

function validUsername(s) {
  const v = (s || "").trim();
  if (v.length < 3 || v.length > 22) return false;
  return /^[a-zA-Z0-9._-]+$/.test(v);
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

/* =========================
   Local persistence (username)
========================= */
const KEY_DRAFT = (uid) => `profile_username_draft_${uid}`;
const KEY_PENDING = (uid) => `profile_username_pending_${uid}`;

function lsGet(k) {
  try { return localStorage.getItem(k) || ""; } catch { return ""; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}
function lsDel(k) {
  try { localStorage.removeItem(k); } catch {}
}

/* =========================
   UI helpers
========================= */
function setNameEditorOpen(open) {
  if (!nameEditor) return;
  nameEditor.hidden = !open;

  if (editNameBtn) editNameBtn.style.display = open ? "none" : "grid";

  // lås input om inte edit-läge
  if (nameInput) nameInput.disabled = !open;

  if (!open && nameHint) nameHint.textContent = "3–22 tecken. Bokstäver/nr/._-";
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
    if (avatarFallback) avatarFallback.style.display = "grid";
  }
}

function applyProfileBadge(flags) {
  if (!badgeEl) return;
  const isAdmin = !!flags?.is_admin;
  const isVerified = !!flags?.is_verified;
  const type = isAdmin ? "admin" : (isVerified ? "verified" : null);

  if (!type) {
    badgeEl.hidden = true;
    badgeEl.classList.remove("is-admin", "is-verified");
    badgeEl.removeAttribute("data-tooltip");
    badgeEl.removeAttribute("aria-label");
    return;
  }

  const label = type === "admin" ? "Owner" : "Verifierad";
  badgeEl.hidden = false;
  badgeEl.textContent = type === "admin" ? "✔" : "✓";
  badgeEl.classList.toggle("is-admin", type === "admin");
  badgeEl.classList.toggle("is-verified", type === "verified");
  badgeEl.setAttribute("data-tooltip", label);
  badgeEl.setAttribute("aria-label", label);
}

/* =========================
   DB
========================= */
async function ensureProfileRow(user) {
  const username = user.email?.split("@")[0] || "Användare";
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id", ignoreDuplicates: true });

  if (error) throw error;
}

async function loadProfile(user) {
  // 1) säkerställ rad
  try {
    await ensureProfileRow(user);
  } catch (e) {
    console.warn("⚠️ ensureProfileRow failed (RLS?), continuing:", e?.message);
  }

  // 2) hämta profil
  const attempts = [
    "username, full_name, about, avatar_url, is_admin, is_verified",
    "username, full_name, about, avatar_url, is_admin",
    "username, full_name, about, avatar_url"
  ];

  let data = null;
  let error = null;

  for (const fields of attempts) {
    const res = await supabase
      .from("profiles")
      .select(fields)
      .eq("id", user.id)
      .maybeSingle();

    if (!res.error) {
      data = res.data || null;
      error = null;
      break;
    }

    error = res.error;
    const msg = String(res.error?.message || "").toLowerCase();
    const missingColumn =
      res.error?.code === "42703" ||
      msg.includes("is_verified") ||
      msg.includes("is_admin");

    if (!missingColumn) break;
  }

  if (error && error.code !== "PGRST116") console.error("❌ loadProfile error:", error);

  const username = data?.username || (user.email?.split("@")[0] || "Användare");
  const displayName = data?.full_name || username;

  if (nameEl) nameEl.textContent = displayName;
  if (aboutEl) aboutEl.value = data?.about || "";

  // Sätt input till sparat username (inte displayName)
  if (nameInput) nameInput.value = username;

  setAvatar(data?.avatar_url || null, initialsFrom(displayName));

  // Editor ska vara stängd + låst tills man trycker penna
  setNameEditorOpen(false);
  applyProfileBadge({ is_admin: !!data?.is_admin, is_verified: !!data?.is_verified });

  return username; // returnera “server truth”
}

async function saveAbout(user) {
  if (!aboutEl) return;
  const about = aboutEl.value || "";

  const { error } = await supabase
    .from("profiles")
    .update({ about, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) console.error("❌ saveAbout error:", error);
}

async function saveUsername(user, proposed) {
  const username = proposed.trim();

  const { error } = await supabase
    .from("profiles")
    .update({ username, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) throw error;
  return username;
}

async function uploadAvatar(user, file) {
  const ext = safeExt(file.name);
  const path = `${user.id}/avatar.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (upErr) throw upErr;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;
  if (!publicUrl) throw new Error("Kunde inte hämta publik URL från avatars-bucketen");

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (dbErr) throw dbErr;

  return publicUrl;
}

/* =========================
   My events
========================= */
function renderCard(ev) {
  const imgs = ev.image_urls || [];
  const first = imgs.length ? imgs[0] : null;

  const timeText = ev.time ? `🕒 ${fmtTime(ev.time)}` : "";
  const endText =
    ev.end_time ? ` ⏳ ${ev.end_time === "sent" ? "Sent" : fmtTime(ev.end_time)}` : "";
  const placeMeta = buildPlaceMeta(ev.place);
  const placeHtml = placeMeta.label
    ? `📍 <a class="my-place-link" href="${placeMeta.href}" target="_blank" rel="noopener noreferrer">${placeMeta.label}</a>`
    : "";
  const metaSeparator = placeHtml ? " • " : "";

  return `
    <article class="my-card" data-event-id="${ev.id}">
      <div class="my-top">
        <div class="my-img">
          ${first ? `<img src="${first}" alt="Evenemangsbild" loading="lazy">` : `<div class="my-img-empty"></div>`}
        </div>

        <div class="my-text">
          <div class="my-title-row">
            <h3 class="my-title">${ev.title || ""}</h3>

            <button
              class="my-del"
              type="button"
              data-action="delete-event"
              data-id="${ev.id}"
              aria-label="Ta bort händelse"
              title="Ta bort"
            >
              Ta bort
            </button>
          </div>

          <p class="my-meta">${placeHtml}${metaSeparator}📅 ${ev.date || ""} ${timeText}${endText}</p>
        </div>
      </div>

      ${ev.info ? `<p class="my-desc">${ev.info}</p>` : ""}
    </article>
  `;
}


async function loadMyEvents(user) {
  if (metaEl) metaEl.textContent = "Laddar händelser...";

  const { data, error } = await supabase
    .from("events")
    .select("id, created_at, title, place, date, time, end_time, info, image_urls, user_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ loadMyEvents error:", error);
    if (metaEl) metaEl.textContent = "Kunde inte ladda händelser.";
    return;
  }

  const list = data || [];
  if (metaEl) metaEl.textContent = `${list.length} publicerade händelser`;

  if (!myEventsEl) return;

  if (list.length === 0) {
    myEventsEl.innerHTML = "";
    if (myEmptyEl) myEmptyEl.style.display = "block";
    return;
  }

  if (myEmptyEl) myEmptyEl.style.display = "none";
  myEventsEl.innerHTML = list.map(renderCard).join("");
}

async function deleteMyEvent(user, eventId) {
  // Viktigt: matcha både id och user_id så du inte kan radera andras
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("user_id", user.id);

  if (error) throw error;
}

function attachMyEventsHandlers(user) {
  if (!myEventsEl) return;

  myEventsEl.addEventListener("click", async (e) => {
    const btn = e.target.closest('[data-action="delete-event"]');
    if (!btn) return;

    const eventId = btn.getAttribute("data-id");
    if (!eventId) return;

    const ok = confirm("Vill du ta bort den här händelsen? Detta går inte att ångra.");
    if (!ok) return;

    // UI: lås knappen direkt
    btn.disabled = true;
    btn.textContent = "Tar bort...";

    try {
      await deleteMyEvent(user, eventId);

      // Ta bort från DOM
      const card = myEventsEl.querySelector(`.my-card[data-event-id="${eventId}"]`);
      card?.remove();

      // Uppdatera meta-räknare + empty state
      const remaining = myEventsEl.querySelectorAll(".my-card").length;
      if (metaEl) metaEl.textContent = `${remaining} publicerade händelser`;

      if (remaining === 0) {
        if (myEmptyEl) myEmptyEl.style.display = "block";
      }
    } catch (err) {
      console.error("❌ delete event failed:", err);
      alert("Kunde inte ta bort händelsen. Kolla RLS/policies.");
      btn.disabled = false;
      btn.textContent = "Ta bort";
    }
  });
}


/* =========================
   Pending username sync
========================= */
async function trySyncPendingUsername(user) {
  const pending = lsGet(KEY_PENDING(user.id)).trim();
  if (!pending) return null;

  // om pending är ogiltig -> rensa
  if (!validUsername(pending)) {
    lsDel(KEY_PENDING(user.id));
    lsDel(KEY_DRAFT(user.id));
    return null;
  }

  try {
    const saved = await saveUsername(user, pending);
    lsDel(KEY_PENDING(user.id));
    lsDel(KEY_DRAFT(user.id));
    return saved;
  } catch (e) {
    // behåll pending så vi kan försöka igen nästa gång
    console.warn("⚠️ Pending username sync failed:", e?.message || e);
    return null;
  }
}

/* =========================
   Init
========================= */
async function main() {
  const session = await requireLogin();
  const user = session.user;

  // 1) om vi har pending från tidigare sidbyte -> försök synca direkt
  const pendingSaved = await trySyncPendingUsername(user);

  // 2) ladda profil
  const serverUsername = await loadProfile(user);

  // 3) om pendingSaved lyckades, uppdatera UI så det syns direkt
  if (pendingSaved) {
    if (nameEl) nameEl.textContent = pendingSaved;
    if (nameInput) nameInput.value = pendingSaved;
    if (!avatarImg?.getAttribute("src")) setAvatar(null, initialsFrom(pendingSaved));
  }

  // 4) om du hade en draft (ändrat men ej sparat) – visa den när du öppnar editorn
  const existingDraft = lsGet(KEY_DRAFT(user.id)).trim();

  let currentUsername = pendingSaved || serverUsername; // vad som faktiskt gäller “just nu”
  let isEditing = false;

  // About autosave (debounce)
  if (aboutEl) {
    let t;
    aboutEl.addEventListener("input", () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => saveAbout(user), 350);
    });
  }

  // Username edit: öppna endast via penna
  editNameBtn?.addEventListener("click", () => {
    isEditing = true;

    // om draft finns -> använd den, annars servervärdet
    const toShow = existingDraft || currentUsername;

    if (nameInput) nameInput.value = toShow;

    setNameEditorOpen(true);
    nameInput?.focus();
    nameInput?.select();
  });

  // Spara draft medan man skriver (så lämnar du sidan så finns texten kvar)
  nameInput?.addEventListener("input", () => {
    if (!isEditing) return;
    lsSet(KEY_DRAFT(user.id), nameInput.value || "");
  });

  attachMyEventsHandlers(user);

  cancelNameBtn?.addEventListener("click", () => {
    isEditing = false;
    setNameEditorOpen(false);

    // lämna draft kvar (så du kan fortsätta senare) ELLER rensa:
    // lsDel(KEY_DRAFT(user.id));
  });

  saveNameBtn?.addEventListener("click", async () => {
    if (!nameInput) return;

    const proposed = nameInput.value;

    if (!validUsername(proposed)) {
      if (nameHint) nameHint.textContent = "Ogiltigt. 3–22 tecken och bara a-z 0-9 . _ -";
      return;
    }

    try {
      const saved = await saveUsername(user, proposed);

      currentUsername = saved;
      if (nameEl) nameEl.textContent = saved;
      if (nameInput) nameInput.value = saved;

      // om ingen avatar: uppdatera initialer
      if (!avatarImg?.getAttribute("src")) setAvatar(null, initialsFrom(saved));

      // rensa draft/pending
      lsDel(KEY_DRAFT(user.id));
      lsDel(KEY_PENDING(user.id));

      isEditing = false;
      setNameEditorOpen(false);
    } catch (e) {
      console.error("❌ saveUsername failed:", e);
      if (nameHint) nameHint.textContent = "Kunde inte spara. Kolla RLS/policies.";
    }
  });

  nameInput?.addEventListener("keydown", (e) => {
    if (!isEditing) return;
    if (e.key === "Enter") saveNameBtn?.click();
    if (e.key === "Escape") cancelNameBtn?.click();
  });

  // Spara “pending” när man lämnar sidan (om man ändrat men inte sparat)
  window.addEventListener("beforeunload", () => {
    if (!isEditing || !nameInput) return;

    const draft = (nameInput.value || "").trim();
    if (!draft) return;

    // bara om den skiljer sig från current
    if (draft !== currentUsername && validUsername(draft)) {
      lsSet(KEY_PENDING(user.id), draft);
      lsSet(KEY_DRAFT(user.id), draft);
    }
  });

  // Avatar upload
  avatarInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadAvatar(user, file);
      const displayName = nameEl?.textContent || "Användare";
      setAvatar(url, initialsFrom(displayName));
    } catch (err) {
      console.error("❌ Avatar upload failed:", err);
      alert(
        "Kunde inte spara profilbild.\n\n" +
          "Kontrollera:\n" +
          "1) Storage bucket 'avatars' existerar\n" +
          "2) Storage policies tillåter upload i '" + user.id + "/*'\n" +
          "3) Filtypen är JPG/PNG/WebP\n\n" +
          "Detalj: " + (err?.message || "okänt fel")
      );
    }
  });

  // Logout
  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "Auth.html";
  });

  // Load my events
  await loadMyEvents(user);
}

main().catch((err) => {
  console.error("❌ Profile init failed:", err);
});
