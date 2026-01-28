import { supabase } from "./supabaseClient.js";

const form = document.getElementById("eventForm");
const formMsg = document.getElementById("formMsg");

const titleEl = document.getElementById("title");
const placeEl = document.getElementById("place");
const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
const infoEl = document.getElementById("info");

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

  // undvik dubbla
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

function validate() {
  clearErrors();

  const title = titleEl.value.trim();
  const place = placeEl.value.trim();
  const date = dateEl.value.trim();
  const time = timeEl.value.trim(); // "" ok
  const info = infoEl.value.trim();

  let ok = true;

  if (title.length < 3) {
    setFieldError(titleEl, "Skriv en titel (minst 3 tecken).");
    ok = false;
  }
  if (place.length < 3) {
    setFieldError(placeEl, "Skriv en plats (minst 3 tecken).");
    ok = false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    setFieldError(dateEl, "Välj ett giltigt datum.");
    ok = false;
  }
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    setFieldError(timeEl, "Tid måste vara i formatet HH:MM.");
    ok = false;
  }
  if (info && info.length > 600) {
    setFieldError(infoEl, "Max 600 tecken i information.");
    ok = false;
  }

  if (!ok) {
    showMsg("error", "Kolla fälten markerade i rött.");
    const first = form.querySelector(".is-invalid");
    if (first) first.focus();
    return null;
  }

  return { title, place, date, time: time || null, info: info || null };
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const data = validate();
  if (!data) return;

  setLoading(true);
  showMsg("success", "Skickar...");

  try {
    const { error } = await supabase.from("events").insert([{
      title: data.title,
      place: data.place,
      date: data.date,
      time: data.time,
      info: data.info,
      author: "Anonym"
      // created_at = default now() i DB
    }]);

    if (error) throw error;

    showMsg("success", "✅ Händelsen är uppladdad!");
    form.reset();

    setTimeout(() => {
      window.location.href = "Hem.html";
    }, 650);

  } catch (err) {
    console.error(err);
    showMsg("error", "❌ Kunde inte ladda upp. Kolla Supabase URL/KEY + RLS policy.");
  } finally {
    setLoading(false);
  }
});
