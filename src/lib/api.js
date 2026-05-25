/* ================================================================
   ALTAAN DETECTOR — Backend client
   ----------------------------------------------------------------
   Wraps fetch() to /api/* endpoints. Sends the session token from
   localStorage when present.
   ================================================================ */

const TOKEN_KEY = "altaan_token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function call(path, opts = {}) {
  const headers = { "content-type": "application/json", ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.authorization = "Bearer " + token;
  const res = await fetch(path, { ...opts, headers });
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((json && json.error) || res.statusText);
    err.status = res.status;
    err.payload = json;
    throw err;
  }
  return json;
}

/* POST a sentence (or paragraph) for AI rewrite. Returns { rewritten, usage }. */
export function rewriteSentence(text, style = "neutral") {
  return call("/api/rewrite", {
    method: "POST",
    body: JSON.stringify({ text, style }),
  });
}

/* Current user info (plan, usage, email). Returns null if not signed in. */
export async function getMe() {
  if (!getToken()) return null;
  try { return await call("/api/me", { method: "GET" }); }
  catch (e) {
    if (e.status === 401) { setToken(null); return null; }
    throw e;
  }
}

export function sendMagicLink(email) {
  return call("/api/auth/send-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyMagicLink(token) {
  return call("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function startCheckout(plan = "monthly") {
  return call("/api/stripe/checkout", {
    method: "POST",
    body: JSON.stringify({ plan }),
  });
}

/* Iraqi manual-approval payment flow */
export function submitUpgradeRequest({ method, reference, amount, notes }) {
  return call("/api/upgrade/request", {
    method: "POST",
    body: JSON.stringify({ method, reference, amount, notes }),
  });
}

/* Admin endpoints */
export function adminListPending() {
  return call("/api/admin/list-pending", { method: "GET" });
}
export function adminApprove(email, days = 30) {
  return call("/api/admin/approve", {
    method: "POST",
    body: JSON.stringify({ email, days }),
  });
}
export function adminReject(email) {
  return call("/api/admin/approve", {
    method: "POST",
    body: JSON.stringify({ email, action: "reject" }),
  });
}
