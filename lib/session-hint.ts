const SESSION_HINT_COOKIE = "kruvo_auth_hint";

export function setSessionHintCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${SESSION_HINT_COOKIE}=active; Path=/; Max-Age=604800; SameSite=Lax`;
}

export function clearSessionHintCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function getSessionHintCookieName() {
  return SESSION_HINT_COOKIE;
}
