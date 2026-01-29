/**
 * Authentication sida: Logga in eller skapa konto
 * - Email confirmation krävs (ingen auto-redirect efter signUp)
 * - Blockera signIn om email inte är verifierad
 * - Robust error handling med Supabase API details
 */

import { supabase } from "./supabaseClient.js";

const msgEl = document.getElementById("authMsg");
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");

const btnLogin = document.getElementById("btnLogin");
const btnSignup = document.getElementById("btnSignup");

function show(type, text) {
  if (!msgEl) return;
  msgEl.textContent = text;
  msgEl.className = `auth-msg ${type === "success" ? "is-success" : "is-error"}`;
}

function setLoading(isLoading) {
  if (btnLogin) btnLogin.disabled = isLoading;
  if (btnSignup) btnSignup.disabled = isLoading;

  if (btnLogin) btnLogin.textContent = isLoading ? "Loggar in..." : "Logga in";
  if (btnSignup) btnSignup.textContent = isLoading ? "Skapar..." : "Skapa konto";
}

/**
 * True om användaren har verifierat email
 */
function isEmailConfirmed(user) {
  return !!(user?.email_confirmed_at || user?.confirmed_at);
}

/**
 * Säker profilrad i databasen
 * @param {Object} user - Supabase auth user
 */
async function ensureProfile(user) {
  const payload = {
    id: user.id,
    username: user.email?.split("@")[0] || "Användare",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) {
    console.error("❌ ensureProfile error:", {
      code: error.code,
      message: error.message,
      hint: error.hint,
    });
    throw error;
  }
}

async function signUp() {
  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email || password.length < 6) {
    return show("error", "Skriv en giltig email och ett lösenord (minst 6 tecken).");
  }

  setLoading(true);
  show("success", "Skapar konto...");

  try {
    // Viktigt: signUp ska INTE logga in användaren direkt när email-confirmation är på.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Valfritt men rekommenderat: lägg till redirect för confirm-länken
      // OBS: måste vara tillåten i Supabase Auth Redirect URLs
      options: {
        emailRedirectTo: `${window.location.origin}/html/confirm.html`,
      },
    });

    if (error) {
      console.error("Supabase signUp error:", error.code, error.message);
      return show("error", error.message || "Kunde inte skapa konto.");
    }

    const user = data?.user;

    // Skapa profilrad kan du göra här (det är OK), MEN redirecta inte till Profil.
    if (user) {
      try {
        await ensureProfile(user);
      } catch (e) {
        console.warn("⚠️ Konto skapat men profil-insert failade:", {
          code: e.code,
          message: e.message,
          hint: e.hint,
        });
        // vi fortsätter ändå – kontot är skapat
      }
    }

    // ✅ Nytt: alltid instruktion istället för redirect
    show(
      "success",
      "Konto skapat! Kolla din email och bekräfta länken. När det är klart kan du logga in."
    );
  } catch (err) {
    console.error("Unexpected signUp error:", err);
    show("error", err?.message || "Kunde inte skapa konto.");
  } finally {
    setLoading(false);
  }
}

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

    const user = data?.user;

    // ✅ Nytt: blockera om email inte verifierad
    if (!isEmailConfirmed(user)) {
      await supabase.auth.signOut();
      return show("error", "Bekräfta din email först (kolla även skräppost), sen logga in igen.");
    }

    // Login lyckades. Försök skapa profilrad (men stoppa inte redirect om den failar)
    if (user) {
      try {
        await ensureProfile(user);
      } catch (e) {
        console.warn("⚠️ Login OK men RLS/profil issue:", {
          code: e.code,
          message: e.message,
          hint: e.hint,
          details: e.details,
        });
      }
    }

    window.location.href = "Profil.html";
  } catch (err) {
    console.error("Unexpected auth error:", err);
    show("error", err?.message || "Kunde inte logga in.");
  } finally {
    setLoading(false);
  }
}

// ===== Events =====
btnLogin?.addEventListener("click", (e) => {
  e.preventDefault();
  signIn();
});

btnSignup?.addEventListener("click", (e) => {
  e.preventDefault();
  signUp();
});

passEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    signIn();
  }
});

// ✅ Ändra: Om redan inloggad -> bara redirect om email är verifierad
(async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();
  const session = data?.session;

  if (!session?.user) return;

  if (!isEmailConfirmed(session.user)) {
    // om någon sitter “halv-inloggad” utan confirm, logga ut och låt dem stanna
    await supabase.auth.signOut();
    show("error", "Du måste bekräfta din email innan du kan fortsätta.");
    return;
  }

  window.location.href = "Profil.html";
})();
