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

async function ensureProfile(user) {
  // Skapar/uppdaterar profilen utan duplicate key
  const payload = {
    id: user.id,
    username: user.email?.split("@")[0] || "Användare",
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .upsert(payload, { onConflict: "id" });

  if (error) throw error;
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
    if (error) throw error;

    const user = data?.user;

    // Om email confirmation är ON kan session saknas, men user finns oftast.
    if (user) {
      await ensureProfile(user);
      window.location.href = "Profil.html";
      return;
    }

    // Fallback om Supabase kräver bekräftelse och inte returnerar user
    show("success", "Konto skapat! Kolla din mail för att bekräfta, sen logga in.");
  } catch (err) {
    console.error(err);
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
    if (error) throw error;

    await ensureProfile(data.user);
    window.location.href = "Profil.html";
  } catch (err) {
    console.error(err);
    show("error", "Fel email/lösenord.");
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
