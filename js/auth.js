/**
 * Authentication sida: Logga in eller skapa konto
 * - Hantera signUp med profile-creation
 * - Hantera signIn med error-recovery
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


// ===== Events =====
btnLogin?.addEventListener("click", (e) => {
  e.preventDefault();
  signIn();
});

btnSignup?.addEventListener("click", (e) => {
  e.preventDefault();
  signUp();
});

// Enter på password => logga in
passEl?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    signIn();
  }
});

// Om redan inloggad, skicka direkt till profil
(async function redirectIfLoggedIn() {
  const { data } = await supabase.auth.getSession();
  if (data?.session) window.location.href = "Profil.html";
})();
