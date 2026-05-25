/* Minimal HMAC-signed token. Not a full JWT library to avoid deps.
   Token = base64url(payload) + "." + base64url(hmac(payload, secret)).
   Payload is JSON { email, iat, exp }. */

import crypto from "node:crypto";

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64urlDecode(str) {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString();
}

const SECRET = process.env.SESSION_SECRET || "dev-insecure-secret-change-me";

export function signToken(payload, ttlSeconds = 60 * 60 * 24 * 30) {
  const body = { ...payload, iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const json = JSON.stringify(body);
  const part = b64url(json);
  const sig = b64url(crypto.createHmac("sha256", SECRET).update(part).digest());
  return `${part}.${sig}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [part, sig] = token.split(".");
  const expectedSig = b64url(crypto.createHmac("sha256", SECRET).update(part).digest());
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(b64urlDecode(part));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

/* Pull bearer token from req headers */
export function getAuthEmail(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (!h || !h.startsWith("Bearer ")) return null;
  const payload = verifyToken(h.slice(7));
  return payload && payload.email ? payload.email : null;
}

/* Admin allowlist — comma-separated emails in ADMIN_EMAILS env var */
export function isAdmin(email) {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}
