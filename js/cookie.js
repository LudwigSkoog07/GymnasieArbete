document.addEventListener("DOMContentLoaded", () => {
  const banner = document.getElementById("cookieBanner");
  const acceptBtn = document.getElementById("cookieAccept");

  if (!banner || !acceptBtn) {
    return;
  }

  if (localStorage.getItem("cookiesAccepted") === "yes") {
    banner.hidden = true;
    return;
  }

  acceptBtn.addEventListener("click", () => {
    localStorage.setItem("cookiesAccepted", "yes");
    banner.hidden = true;
  });
});
