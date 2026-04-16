const POST_AUTH_INTENT_KEY = "kruvii-post-auth-intent";

function sanitiseIntentPath(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const trimmed = path.trim();

  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
    return null;
  }

  return trimmed;
}

export function rememberPostAuthIntent(path: string) {
  if (typeof window === "undefined") {
    return;
  }

  const safePath = sanitiseIntentPath(path);

  if (!safePath) {
    return;
  }

  window.localStorage.setItem(POST_AUTH_INTENT_KEY, safePath);
}

export function readPostAuthIntent() {
  if (typeof window === "undefined") {
    return null;
  }

  return sanitiseIntentPath(window.localStorage.getItem(POST_AUTH_INTENT_KEY));
}

export function clearPostAuthIntent() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(POST_AUTH_INTENT_KEY);
}
