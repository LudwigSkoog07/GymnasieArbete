# CODE PATCHES - Snabb referens för alla ändringar

## FILE 1: js/auth.js

### Change 1.1: signIn() - Robust error handling
```javascript
async function signIn() {
  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) return show("error", "Fyll i email och lösenord.");

  setLoading(true);
  show("success", "Loggar in...");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Supabase auth error:", error.code, error.message);
      return show("error", error.message || "Kunde inte logga in.");
    }

    // Login lyckades. Försök skapa profilrad, men låt INTE detta stoppa redirect.
    // Detta är kritiskt för att undvika "fel lösenord"-meddelandet när profil-upserting failar.
    if (data.user) {
      try {
        await ensureProfile(data.user);
      } catch (e) {
        console.warn("⚠️ Login OK men RLS/profil issue:", {
          code: e.code,
          message: e.message,
          hint: e.hint,
          details: e.details,
        });
        // Visar INTE fel för användaren; redirect sker nedan
      }
    }

    // ✅ Inloggning lyckades - redirect nu
    window.location.href = "Profil.html";
  } catch (err) {
    console.error("Unexpected auth error:", err);
    show("error", err?.message || "Kunde inte logga in.");
  } finally {
    setLoading(false);
  }
}
```

### Change 1.2: signUp() - Better error messages
```javascript
async function signUp() {
  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email || password.length < 6) {
    return show("error", "Skriv en giltig email och ett lösenord (minst 6 tecken).");
  }

  setLoading(true);
  show("success", "Skapar konto...");

  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error("Supabase signUp error:", error.code, error.message);
      return show("error", error.message || "Kunde inte skapa konto.");
    }

    const user = data?.user;

    // Om email confirmation är ON kan session saknas, men user finns oftast.
    if (user) {
      try {
        await ensureProfile(user);
        window.location.href = "Profil.html";
        return;
      } catch (e) {
        console.warn("⚠️ Konto skapat men profil-insert failade:", {
          code: e.code,
          message: e.message,
          hint: e.hint,
        });
        // Fallback: visa att konto är skapat men profil-upserting failade
        show("error", 
          "Konto skapat, men kunde inte uppdatera profil (RLS/DB issue). " +
          "Logga in och försök igen på Profil-sidan."
        );
        return;
      }
    }

    // Fallback om Supabase kräver bekräftelse och inte returnerar user
    show("success", "Konto skapat! Kolla din mail för att bekräfta, sen logga in.");
  } catch (err) {
    console.error("Unexpected signUp error:", err);
    show("error", err?.message || "Kunde inte skapa konto.");
  } finally {
    setLoading(false);
  }
}
```

---

## FILE 2: js/guard.js

### Change 2.1: Full replacement - Robust session handling
```javascript
import { supabase } from "./supabaseClient.js";

export async function requireLogin() {
  try {
    const { data, error } = await supabase.auth.getSession();
    
    if (error) {
      console.error("Error fetching session:", {
        code: error.code,
        message: error.message,
      });
      window.location.href = "Auth.html";
      throw new Error(`Session error: ${error.message}`);
    }
    
    if (!data?.session) {
      console.warn("No active session found");
      window.location.href = "Auth.html";
      throw new Error("Not logged in");
    }
    
    console.log("✅ Session valid, user:", data.session.user.id);
    return data.session;
  } catch (err) {
    console.error("requireLogin() caught error:", err.message);
    throw err;
  }
}
```

---

## FILE 3: js/profil.js

### Change 3.1: ensureProfileRow() - Detailed error logging
```javascript
async function ensureProfileRow(user) {
  const username = user.email?.split("@")[0] || "User";
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, username }, { onConflict: "id" });
    if (error) {
      console.error("ensureProfileRow upsert error:", {
        code: error.code,
        message: error.message,
        hint: error.hint,
        details: error.details,
      });
      throw error;
    }
    console.log("✅ Profile row ensured for", user.id);
  } catch (err) {
    console.error("ensureProfileRow() exception:", err);
    throw err;
  }
}
```

### Change 3.2: loadProfile() - Use maybeSingle() instead of single()
```javascript
async function loadProfile(user) {
  try {
    await ensureProfileRow(user);
  } catch (e) {
    console.error("Could not ensure profile row, continuing:", e.message);
    // Fortsätt - profilens data kanske redan finns eller kommer skapas senare
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("username, about, avatar_url")
    .eq("id", user.id)
    .maybeSingle(); // Use maybeSingle() för att inte fela om rad saknas

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows found, vilket är OK
    console.error("loadProfile select error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
  }

  const username = data?.username || (user.email?.split("@")[0] || "User");

  if (nameEl) nameEl.textContent = username;
  if (aboutEl) aboutEl.value = data?.about || "";

  const initials = username.slice(0, 2).toUpperCase();
  setAvatar(data?.avatar_url || null, initials);
}
```

### Change 3.3: uploadAvatar() - Detailed error logging
```javascript
async function uploadAvatar(user, file) {
  const ext = safeExt(file.name);
  const path = `${user.id}/avatar.${ext}`;

  console.log("Uploading avatar to bucket 'avatars', path:", path);

  const { error: upErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (upErr) {
    console.error("Storage upload error:", {
      code: upErr.code,
      message: upErr.message,
      statusCode: upErr.statusCode,
    });
    throw upErr;
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl;

  if (!publicUrl) {
    console.error("Could not get public URL from storage");
    throw new Error("Could not get public URL from storage");
  }

  const { error: dbErr } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (dbErr) {
    console.error("Database update error:", {
      code: dbErr.code,
      message: dbErr.message,
      hint: dbErr.hint,
    });
    throw dbErr;
  }

  console.log("✅ Avatar uploaded and DB updated");
  return publicUrl;
}
```

### Change 3.4: Avatar input event listener - Better error message
```javascript
  avatarInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const url = await uploadAvatar(user, file);
      const username = (nameEl?.textContent || "User");
      setAvatar(url, username.slice(0, 2).toUpperCase());
      console.log("✅ Avatar changed successfully");
    } catch (err) {
      console.error("Avatar upload failed:", {
        code: err.code,
        message: err.message,
        hint: err.hint,
      });
      alert(
        "Kunde inte spara profilbild.\n\n" +
        "Kontrollera:\n" +
        "1. Storage bucket 'avatars' existerar\n" +
        "2. RLS policies tillåter insert/update i '" + user.id + "/*'\n" +
        "3. Fil är en giltig bild (PNG/JPG/WebP)\n\n" +
        "Detalj: " + err.message
      );
    }
  });
```

### Change 3.5: loadMyEvents() - Detailed error logging
```javascript
async function loadMyEvents(user) {
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("author", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadMyEvents error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
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
```

---

## FILE 4: js/laddaupp.js

### Change 4.1: uploadImages() - Detailed error logging
```javascript
async function uploadImages(files, userId) {
  if (!files || files.length === 0) return [];

  const urls = [];

  for (const file of files) {
    const path = safePath(file, userId);

    console.log("Uploading event image to bucket 'event-images', path:", path);

    const { error: upErr } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (upErr) {
      console.error("Storage upload error:", {
        code: upErr.code,
        message: upErr.message,
        statusCode: upErr.statusCode,
      });
      throw upErr;
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) {
      console.log("✅ Image uploaded:", data.publicUrl);
      urls.push(data.publicUrl);
    }
  }

  return urls;
}
```

### Change 4.2: Event form submit - Detailed error handling
```javascript
    try {
      const authorName = await getProfileName(freshUser);
      const imageUrls = await uploadImages(data.files, freshUser.id);

      // ✅ Kritisk: author = user.id så Profil kan .eq("author", user.id)
      const payload = {
        title: data.title,
        place: data.place,
        date: data.date,
        time: data.startTime,
        end_time: data.endTime,
        info: data.info,
        author: freshUser.id,
        image_urls: imageUrls.length ? imageUrls : null,
        author_name: authorName,
      };

      console.log("Creating event with payload:", payload);

      const { error } = await supabase.from("events").insert([payload]);
      if (error) {
        console.error("Event insert error:", {
          code: error.code,
          message: error.message,
          hint: error.hint,
          details: error.details,
        });
        throw error;
      }

      console.log("✅ Event created successfully");
      showMsg("success", "✅ Händelsen är uppladdad!");
      form.reset();

      selectedFiles = [];
      updateInputFiles();
      renderPreviews();

      if (endLateEl) endLateEl.checked = false;
      setEndMode();

      setTimeout(() => (window.location.href = "Hem.html"), 650);
    } catch (err) {
      console.error("Event upload failed:", {
        code: err.code,
        message: err.message,
        hint: err.hint,
      });
      showMsg(
        "error",
        "❌ Kunde inte ladda upp.\n\n" +
        "Kontrollera:\n" +
        "1. Storage bucket 'event-images' existerar\n" +
        "2. RLS policy på 'events' tillåter insert med author = auth.uid()\n" +
        "3. Storage policy tillåter insert i 'events/${user_id}/*' folder\n\n" +
        "Detalj: " + err.message
      );
    } finally {
      setLoading(false);
    }
```

---

## FILE 5: js/events.js

### Change 5.1: loadEvents() - Detailed error logging
```javascript
async function loadEvents() {
  if (!grid || !empty || !countEl) return;

  console.log("Loading events from Supabase...");

  // Join mot profiles via FK/relation på events.author -> profiles.id
  const { data, error } = await supabase
    .from("events")
    .select(`
      *,
      profiles:author (
        username,
        full_name,
        avatar_url
      )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadEvents error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    grid.innerHTML = `<p>Kunde inte ladda händelser.</p>`;
    empty.hidden = true;
    countEl.textContent = "";
    return;
  }

  const list = data || [];
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
```

---

## QUICK SUMMARY

| File | Changes | Impact |
|------|---------|--------|
| auth.js | signIn/signUp error handling | ✅ Fixes "wrong password but logged in" |
| guard.js | Add error handling | ✅ Better debugging |
| profil.js | loadProfile (.maybeSingle), avatar error msg | ✅ Handles missing profiles, better error |
| laddaupp.js | Event insert error handling | ✅ Shows why upload fails |
| events.js | loadEvents error logging | ✅ Better debugging |

---

## HOW TO USE THIS GUIDE

1. For each file, find the exact code block here
2. Copy the new version
3. Paste it into your file, replacing the old code
4. Test in browser console
5. If still failing, screenshot console error and cross-reference SQL_SETUP.sql

