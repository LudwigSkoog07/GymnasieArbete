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
