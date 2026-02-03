import { supabase } from "./supabaseClient.js";

const authCta = document.getElementById("authCta");
const protectedLinks = Array.from(document.querySelectorAll('[data-auth="required"]'));

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
    const isLoggedIn = !!data?.session?.user;

    if (authCta && authCta.dataset.hideWhenAuthed === "true") {
      authCta.hidden = isLoggedIn;
    }

    if (!isLoggedIn) {
      protectedLinks.forEach(blockLink);
    }
  } catch (err) {
    console.error("headerAuth failed:", err);
  }
}

initHeaderAuth();
