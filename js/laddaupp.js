import { supabase } from "./supabaseClient.js";

/* =========================
   Elements
========================= */
const form = document.getElementById("eventForm");
const formMsg = document.getElementById("formMsg");

const titleEl = document.getElementById("title");
const placeEl = document.getElementById("place");
const dateEl = document.getElementById("date");

const startTimeEl = document.getElementById("startTime");
const endTimeEl = document.getElementById("endTime");
const endLateEl = document.getElementById("endLate");

const infoEl = document.getElementById("info");

const imagesEl = document.getElementById("images");
const imgPreviewEl = document.getElementById("imgPreview");

const IMAGE_BUCKET = "event-images";
let selectedFiles = [];

/* =========================
   Auth guard + profile cache
   
========================= */
let currentUser = null;
let currentProfile = null;

import { requireLogin } from "./guard.js";
import { supabase } from "./supabaseClient.js";

const user = await requireLogin();
if (!user) return;

async function requireAuth() {
  const { data, error } = await supabase.auth.getSession();
  if (error) console.warn(error);

  const user = data?.session?.user;
  if (!user) {
    window.location.href = "Auth.html";
    return null;
  }
  currentUser = user;
  return user;
}

async function loadMyProfile() {
  if (!currentUser) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, avatar_url")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.warn("Could not load profile:", error);
    return null;
  }

  currentProfile = data;
  return data;
}

function getAuthorName() {
  return (
    currentProfile?.full_name ||
    currentProfile?.username ||
    (currentUser?.email ? currentUser.email.split("@")[0] : "Användare")
  );
}

/* =========================
   UI helpers
========================= */
function clearErrors() {
  formMsg.textContent = "";
  formMsg.className = "form-msg";
  form.querySelectorAll("input, textarea").forEach(el => el.classList.remove("is-invalid"));
  form.querySelectorAll(".error-text").forEach(el => el.remove());
}

function setFieldError(el, msg) {
  el.classList.add("is-invalid");
  const wrap = el.closest(".field");
  if (!wrap) return;

  const existing = wrap.querySelector(".error-text");
  if (existing) existing.remove();

  const err = document.createElement("div");
  err.className = "error-text";
  err.textContent = msg;
  wrap.appendChild(err);
}

function showMsg(type, text) {
  formMsg.textContent = text;
  formMsg.className = `form-msg ${type === "success" ? "is-success" : "is-error"}`;
}

function setLoading(isLoading) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;

  btn.disabled = isLoading;
  btn.dataset.originalText ||= btn.textContent;
  btn.textContent = isLoading ? "Laddar upp..." : btn.dataset.originalText;
}

/* =========================
   End time “Sent”
========================= */
function setEndMode() {
  if (!endTimeEl || !endLateEl) return;
  const late = endLateEl.checked;

  if (late) {
    endTimeEl.value = "";
    endTimeEl.disabled = true;
    endTimeEl.classList.add("is-disabled");
  } else {
    endTimeEl.disabled = false;
    endTimeEl.classList.remove("is-disabled");
  }
}

function getEndTimeValue() {
  if (endLateEl?.checked) return "sent";
  const v = (endTimeEl?.value || "").trim();
  return v ? v : null;
}

endLateEl?.addEventListener("change", setEndMode);
setEndMode();

/* =========================
   Images preview + remove
========================= */
function updateInputFiles() {
  if (!imagesEl) return;
  const dt = new DataTransfer();
  selectedFiles.forEach(f => dt.items.add(f));
  imagesEl.files = dt.files;
}

function renderPreviews() {
  if (!imgPreviewEl) return;
  imgPreviewEl.innerHTML = "";

  if (selectedFiles.length === 0) {
    imgPreviewEl.hidden = true;
    return;
  }

  imgPreviewEl.hidden = false;

  selectedFiles.forEach((file, index) => {
    const url = URL.createObjectURL(file);

    const item = document.createElement("div");
    item.className = "img-item";
    item.innerHTML = `
      <img src="${url}" alt="Preview" loading="lazy">
      <button type="button" class="img-remove" aria-label="Ta bort bild">✕</button>
    `;

    item.querySelector(".img-remove").addEventListener("click", () => {
      selectedFiles.splice(index, 1);
      updateInputFiles();
      renderPreviews();
    });

    imgPreviewEl.appendChild(item);
  });
}

imagesEl?.addEventListener("change", (e) => {
  const newFiles = Array.from(e.target.files || []);
  selectedFiles = [...selectedFiles, ...newFiles].slice(0, 5);
  updateInputFiles();
  renderPreviews();
});

/* =========================
   Validation
========================= */
function validate() {
  clearErrors();

  const title = titleEl.value.trim();
  const place = placeEl.value.trim();
  const date = dateEl.value.trim();

  const startTime = (startTimeEl?.value || "").trim();
  const endTime = getEndTimeValue();
  const info = infoEl.value.trim();

  let ok = true;

  if (title.length < 3) { setFieldError(titleEl, "Skriv en titel (minst 3 tecken)."); ok = false; }
  if (place.length < 3) { setFieldError(placeEl, "Skriv en plats (minst 3 tecken)."); ok = false; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setFieldError(dateEl, "Välj ett giltigt datum."); ok = false; }

  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) {
    setFieldError(startTimeEl, "Välj en giltig starttid (HH:MM).");
    ok = false;
  }

  if (endTime && endTime !== "sent" && !/^\d{2}:\d{2}$/.test(endTime)) {
    setFieldError(endTimeEl, "Sluttid måste vara HH:MM eller välj “Sent”.");
    ok = false;
  }

  if (endTime && endTime !== "sent") {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if ((eh * 60 + em) < (sh * 60 + sm)) {
      setFieldError(endTimeEl, "Sluttid kan inte vara tidigare än starttid.");
      ok = false;
    }
  }

  if (info && info.length > 600) { setFieldError(infoEl, "Max 600 tecken i information."); ok = false; }

  if (!ok) {
    showMsg("error", "Kolla fälten markerade i rött.");
    const first = form.querySelector(".is-invalid");
    if (first) first.focus();
    return null;
  }

  return { title, place, date, startTime, endTime, info: info || null, files: selectedFiles };
}

/* =========================
   Supabase upload
========================= */
function safePath(file, userId) {
  const ext = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const id = crypto.randomUUID();
  const yyyy = new Date().getFullYear();
  return `events/${userId}/${yyyy}/${id}.${ext}`;
}

async function uploadImages(files, userId) {
  if (!files || files.length === 0) return [];

  const urls = [];

  for (const file of files) {
    const path = safePath(file, userId);

    const { error: upErr } = await supabase
      .storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }

  return urls;
}

/* =========================
   Init (ensure logged in)
========================= */
await requireAuth();
await loadMyProfile();

/* =========================
   Submit -> DB (with user_id)
========================= */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Double-check auth (if session expired)
  const user = await requireAuth();
  if (!user) return;

  // Keep profile fresh
  if (!currentProfile) await loadMyProfile();

  const data = validate();
  if (!data) return;

  setLoading(true);
  showMsg("success", "Skickar...");

  try {
    // 1) upload images (optional)
    const imageUrls = await uploadImages(data.files, user.id);

    // 2) insert into events (RLS requires user_id = auth.uid())
    const payload = {
      user_id: user.id,
      title: data.title,
      place: data.place,
      date: data.date,
      time: data.startTime,
      end_time: data.endTime,
      info: data.info,
      author: getAuthorName(),
      image_urls: imageUrls.length ? imageUrls : null
    };

    const { error } = await supabase.from("events").insert([payload]);
    if (error) throw error;

    showMsg("success", "✅ Händelsen är uppladdad!");
    form.reset();

    // reset UI state
    selectedFiles = [];
    updateInputFiles();
    renderPreviews();
    if (endLateEl) endLateEl.checked = false;
    setEndMode();

    setTimeout(() => (window.location.href = "Hem.html"), 650);

  } catch (err) {
    console.error(err);
    showMsg("error", "❌ Kunde inte ladda upp. Kolla RLS policies + Storage bucket.");
  } finally {
    setLoading(false);
  }
});
