const COOKIE_KEY = "cookiesAccepted";
const COOKIE_VALUE = "yes";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

const storageAvailable = () => {
  try {
    const testKey = "__cookie_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const readConsent = () => {
  if (storageAvailable()) {
    try {
      return localStorage.getItem(COOKIE_KEY);
    } catch {}
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${encodeURIComponent(COOKIE_KEY)}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
};

const writeConsent = () => {
  if (storageAvailable()) {
    localStorage.setItem(COOKIE_KEY, COOKIE_VALUE);
    return;
  }

  document.cookie = `${encodeURIComponent(COOKIE_KEY)}=${encodeURIComponent(COOKIE_VALUE)}; max-age=${COOKIE_MAX_AGE}; path=/; samesite=lax`;
};

const initCookieBanner = () => {
  const banner = document.getElementById("cookieBanner");
  const acceptBtn = document.getElementById("cookieAccept");

  if (!banner || !acceptBtn) return;

  if (readConsent() === COOKIE_VALUE) {
    banner.hidden = true;
    return;
  }

  acceptBtn.addEventListener("click", () => {
    try {
      writeConsent();
    } catch (err) {
      console.warn("Cookie consent could not be saved:", err);
    }
    banner.hidden = true;
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCookieBanner);
} else {
  initCookieBanner();
}
