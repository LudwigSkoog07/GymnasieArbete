import { supabase } from "./supabaseClient.js";

const authCta = document.getElementById("authCta");
const protectedLinks = Array.from(document.querySelectorAll('[data-auth="required"]'));

function setAuthCtaVisible(show) {
  if (!authCta) return;
  authCta.hidden = !show;
  authCta.style.display = show ? "" : "none";
  authCta.setAttribute("aria-hidden", show ? "false" : "true");
}

function badgeTypeFromFlags(flags) {
  if (flags?.is_admin) return "admin";
  if (flags?.is_verified) return "verified";
  return null;
}

function applyProfileBadge(flags) {
  const type = badgeTypeFromFlags(flags);
  const toggles = Array.from(document.querySelectorAll(".profile-toggle"));

  toggles.forEach((toggle) => {
    let badge = toggle.querySelector(".profile-badge");

    if (!type) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement("span");
      badge.className = "user-badge profile-badge";
      badge.setAttribute("role", "img");
      toggle.appendChild(badge);
    }

    const label = type === "admin" ? "Owner" : "Verifierad";
    badge.classList.toggle("is-admin", type === "admin");
    badge.classList.toggle("is-verified", type === "verified");
    badge.textContent = type === "admin" ? "✔" : "✓";
    badge.setAttribute("aria-label", label);
    badge.setAttribute("data-tooltip", label);
  });
}

async function loadProfileFlags(userId) {
  if (!userId) return { is_admin: false, is_verified: false };

  const attempts = ["is_admin, is_verified", "is_admin"];
  let lastError = null;

  for (const fields of attempts) {
    const { data, error } = await supabase
      .from("profiles")
      .select(fields)
      .eq("id", userId)
      .maybeSingle();

    if (!error) {
      return {
        is_admin: !!data?.is_admin,
        is_verified: !!data?.is_verified,
      };
    }

    lastError = error;
    const msg = String(error?.message || "").toLowerCase();
    const missingColumn =
      error?.code === "42703" ||
      msg.includes("is_verified") ||
      msg.includes("is_admin");

    if (!missingColumn) break;
  }

  if (lastError) {
    console.warn("headerAuth profile flags failed:", lastError.message || lastError);
  }

  return { is_admin: false, is_verified: false };
}

function blockLink(link) {
  if (!link || link.dataset.authBlocked === "1") return;

  link.dataset.authBlocked = "1";
  link.classList.add("is-disabled");
  link.setAttribute("aria-disabled", "true");

  link.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    alert("Logga in for att anvanda den sidan.");
  });
}

async function initHeaderAuth() {
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUser = data?.session?.user || null;
    const isLoggedIn = !!sessionUser;

    setAuthCtaVisible(!isLoggedIn);

    if (!isLoggedIn) {
      protectedLinks.forEach(blockLink);
      applyProfileBadge({ is_admin: false, is_verified: false });
      return;
    }

    const flags = await loadProfileFlags(sessionUser.id);
    applyProfileBadge(flags);
  } catch (err) {
    console.error("headerAuth failed:", err);
  }
}

initHeaderAuth();

