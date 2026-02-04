const toggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#mobileNav");

if (toggle && nav) {
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    nav.classList.toggle("active", open);
  };

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!isOpen);
  });

  // Close on click outside
  document.addEventListener("click", (e) => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    if (!isOpen) return;
    if (nav.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });

  // If you resize to desktop, force-close (prevents weird states)
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) setOpen(false);
  });
}

const profileMenus = Array.from(document.querySelectorAll(".profile-menu"));

if (profileMenus.length) {
  const setMenuOpen = (menu, open) => {
    menu.classList.toggle("is-open", open);
    const toggle = menu.querySelector(".profile-toggle");
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  };

  const closeAllMenus = (except) => {
    profileMenus.forEach((menu) => {
      if (menu === except) return;
      setMenuOpen(menu, false);
    });
  };

  profileMenus.forEach((menu) => {
    const toggle = menu.querySelector(".profile-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains("is-open");
      if (isOpen) {
        setMenuOpen(menu, false);
      } else {
        closeAllMenus(menu);
        setMenuOpen(menu, true);
      }
    });
  });

  document.addEventListener("click", (e) => {
    const clickedInside = profileMenus.some((menu) => menu.contains(e.target));
    if (!clickedInside) closeAllMenus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllMenus();
  });
}

const backToTop = document.getElementById("backToTop");

if (backToTop) {
  const toggleVisibility = () => {
    const shouldShow = window.scrollY > 280;
    backToTop.hidden = !shouldShow;
  };

  window.addEventListener("scroll", toggleVisibility, { passive: true });
  toggleVisibility();

  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
