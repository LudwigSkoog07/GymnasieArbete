// ../js/laddaupp.js
import { supabase } from "./supabaseClient.js";
import { requireLogin } from "./guard.js";

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
   Msg + Loading
========================= */
function showMsg(type, text) {
  if (!formMsg) return;
  formMsg.textContent = text;
  formMsg.className = `form-msg ${type === "success" ? "is-success" : "is-error"}`;
}

function setLoading(isLoading) {
  const btn = form?.querySelector('button[type="submit"]');
  if (!btn) return;

  btn.disabled = isLoading;
  btn.dataset.originalText ||= btn.textContent;
  btn.textContent = isLoading ? "Laddar upp..." : btn.dataset.originalText;
}

/* =========================
   Field errors
========================= */
function clearErrors() {
  if (!form) return;

  if (formMsg) {
    formMsg.textContent = "";
    formMsg.className = "form-msg";
  }

  form.querySelectorAll("input, textarea").forEach((el) => el.classList.remove("is-invalid"));
  form.querySelectorAll(".error-text").forEach((el) => el.remove());
}

function setFieldError(el, msg) {
  if (!el) return;
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
  selectedFiles.forEach((f) => dt.items.add(f));
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
      <img src="${url}" alt="Förhandsvisning" loading="lazy">
      <button type="button" class="img-remove" aria-label="Ta bort bild">✕</button>
    `;

    item.querySelector(".img-remove")?.addEventListener("click", () => {
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

  const title = (titleEl?.value || "").trim();
  const place = (placeEl?.value || "").trim();
  const date = (dateEl?.value || "").trim(); // YYYY-MM-DD

  const startTime = (startTimeEl?.value || "").trim(); // HH:MM
  const endTime = getEndTimeValue(); // "sent" | "HH:MM" | null
  const info = (infoEl?.value || "").trim();

  let ok = true;

  if (title.length < 3) { setFieldError(titleEl, "Skriv en titel (minst 3 tecken)."); ok = false; }
  if (!place || place.length < 3) { setFieldError(placeEl, "Skriv en adress (minst 3 tecken)."); ok = false; }
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
    form?.querySelector(".is-invalid")?.focus();
    return null;
  }

  return { title, place, date, startTime, endTime, info: info || null, files: selectedFiles };
}

/* =========================
   Storage upload helpers
========================= */
function safePath(file, userId) {
  const extRaw = (file.name?.split(".").pop() || "jpg").toLowerCase();
  const ext = extRaw.replace(/[^a-z0-9]/g, "") || "jpg";
  const id = crypto.randomUUID();
  const yyyy = new Date().getFullYear();
  return `events/${userId}/${yyyy}/${id}.${ext}`;
}

async function uploadImages(files, userId) {
  if (!files || files.length === 0) return [];

  const urls = [];

  for (const file of files) {
    const path = safePath(file, userId);

    const { error: upErr } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (upErr) throw upErr;

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }

  return urls;
}

/* =========================
   Init + Submit
========================= */
(async function init() {
  const session = await requireLogin();
  const user = session?.user;

  if (!user) {
    window.location.href = "/html/Auth.html";
    return;
  }

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    // extra safety: session kan dö
    const fresh = await supabase.auth.getSession();
    const freshUser = fresh?.data?.session?.user;
    if (!freshUser) {
      window.location.href = "/html/Auth.html";
      return;
    }

    const v = validate();
    if (!v) return;

    setLoading(true);
    showMsg("success", "Skickar...");

    try {
      // 1) Upload images
      const imageUrls = await uploadImages(v.files, freshUser.id);

      // 2) Ensure profile row exists so uploader name is available to feeds
      try {
        const username = freshUser.email?.split("@")[0] || "Användare";
        await supabase
          .from("profiles")
          .upsert({ id: freshUser.id, username }, { onConflict: "id", ignoreDuplicates: true });
      } catch (e) {
        console.warn("⚠️ Kunde inte upserta profile:", e?.message || e);
      }

      // 3) Insert event (matchar din DB)
      const payload = {
        title: v.title,
        place: v.place,
        date: v.date,              // date column (YYYY-MM-DD)
        time: v.startTime,         // time column (HH:MM)
        end_time: v.endTime,       // text (HH:MM eller "sent" eller null)
        info: v.info,
        user_id: freshUser.id,
        image_urls: imageUrls      // alltid array ([])
      };

      // Lägg till lat/lon om de finns (defensivt)
      const latRaw = document.getElementById("placeLat")?.value || "";
      const lonRaw = document.getElementById("placeLon")?.value || "";
      const lat = Number.parseFloat(String(latRaw).trim());
      const lon = Number.parseFloat(String(lonRaw).trim());

      if (Number.isFinite(lat)) payload.place_lat = lat;
      if (Number.isFinite(lon)) payload.place_lon = lon;

      async function insertEventWithFallback(data) {
        let res = await supabase
          .from("events")
          .insert([data])
          .select("id")
          .single();

        if (!res.error) return res;

        const msg = String(res.error?.message || "").toLowerCase();
        const missingColumn =
          res.error?.code === "42703" ||
          msg.includes('column "place_lat"') ||
          msg.includes('column "place_lon"') ||
          msg.includes("place_lat") ||
          msg.includes("place_lon");

        if (!missingColumn) return res;

        const fallback = { ...data };
        delete fallback.place_lat;
        delete fallback.place_lon;

        return await supabase
          .from("events")
          .insert([fallback])
          .select("id")
          .single();
      }

      const { data: inserted, error } = await insertEventWithFallback(payload);
      if (error) throw error;

      const eventId = inserted.id;

      // 4) Auto-attend creator (lägg efter vi har eventId)
      const { error: attendErr } = await supabase
        .from("event_attendees")
        .insert([{ event_id: eventId, user_id: freshUser.id }]);

      // om den redan finns av någon anledning, ignorera
      if (attendErr) console.warn("Kunde inte auto-anmäla skaparen:", attendErr.message);


      showMsg("success", "✅ Händelsen är uppladdad!");
      form.reset();

      selectedFiles = [];
      updateInputFiles();
      renderPreviews();

      if (endLateEl) endLateEl.checked = false;
      setEndMode();

      setTimeout(() => (window.location.href = "../index.html"), 650);
    } catch (err) {
      console.error("Upload failed:", err);

      const msg =
        String(err?.message || "").includes("row-level security")
          ? "❌ Blockeras av RLS policy. Kolla policies på events + storage."
          : (err?.message || "❌ Kunde inte ladda upp.");

      showMsg("error", msg);
    } finally {
      setLoading(false);
    }
  });
})();
