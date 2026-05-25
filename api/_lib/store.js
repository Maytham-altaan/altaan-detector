/* Tiny persistence layer.
   Uses Vercel KV (REST) when KV_REST_API_URL is set.
   Falls back to an in-memory Map for local `vercel dev` runs without KV.
   This means dev-only usage doesn't persist across restarts — fine for testing. */

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;
const memory = new Map();

async function kv(cmd, args) {
  const body = [cmd, ...args];
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`KV ${cmd} failed: ${res.status}`);
  const json = await res.json();
  return json.result;
}

export async function getJSON(key) {
  if (!URL) return memory.get(key) || null;
  const raw = await kv("GET", [key]);
  return raw ? JSON.parse(raw) : null;
}
export async function setJSON(key, value, ttlSeconds) {
  const data = JSON.stringify(value);
  if (!URL) { memory.set(key, value); return; }
  const args = [key, data];
  if (ttlSeconds) args.push("EX", ttlSeconds);
  await kv("SET", args);
}
export async function del(key) {
  if (!URL) { memory.delete(key); return; }
  await kv("DEL", [key]);
}
export async function incrBy(key, n) {
  if (!URL) {
    const cur = (memory.get(key) || 0) + n;
    memory.set(key, cur);
    return cur;
  }
  return await kv("INCRBY", [key, n]);
}

/* User shape we store:
   user:{email} -> { email, plan, stripeCustomerId, createdAt }
   usage daily key: usage:{email}:{YYYYMMDD}  -> integer words used today
   usage monthly key: usage:{email}:{YYYYMM} -> integer words used this month */

export async function getUser(email) {
  if (!email) return null;
  return await getJSON(`user:${email.toLowerCase()}`);
}
export async function upsertUser(email, patch = {}) {
  const k = `user:${email.toLowerCase()}`;
  const existing = (await getJSON(k)) || { email, plan: "free", createdAt: Date.now() };
  const merged = { ...existing, ...patch };
  await setJSON(k, merged);
  return merged;
}

function today() {
  const d = new Date();
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
}
function thisMonth() {
  const d = new Date();
  return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0");
}

export async function getUsage(email, plan) {
  const FREE_DAILY = parseInt(process.env.FREE_WORDS_PER_DAY || "200", 10);
  const PREMIUM_MONTHLY = parseInt(process.env.PREMIUM_WORDS_PER_MONTH || "50000", 10);
  if (plan === "premium") {
    const k = `usage:${email.toLowerCase()}:${thisMonth()}`;
    const used = (await getJSON(k)) || 0;
    return { used, limit: PREMIUM_MONTHLY, period: "month" };
  }
  const k = `usage:${email.toLowerCase()}:${today()}`;
  const used = (await getJSON(k)) || 0;
  return { used, limit: FREE_DAILY, period: "day" };
}

export async function addUsage(email, plan, words) {
  const key = plan === "premium"
    ? `usage:${email.toLowerCase()}:${thisMonth()}`
    : `usage:${email.toLowerCase()}:${today()}`;
  const cur = (await getJSON(key)) || 0;
  const next = cur + words;
  // expire daily counters after 2 days, monthly after 35
  await setJSON(key, next, plan === "premium" ? 60 * 60 * 24 * 35 : 60 * 60 * 24 * 2);
  return next;
}

/* =====================================================================
   PENDING PAYMENT REQUESTS (Iraqi manual-approval flow)
   ---------------------------------------------------------------------
   When a user submits a payment claim, we store it under
   pending:{email} and add their email to the pendings_list set.
   Admin sees all pendings; approves -> user.plan = premium with
   plan_expires_at = now + 30 days; removed from pendings_list. */

const PENDINGS_LIST_KEY = "pendings_list";

export async function getPendingsList() {
  return (await getJSON(PENDINGS_LIST_KEY)) || [];
}

export async function getPending(email) {
  return await getJSON(`pending:${email.toLowerCase()}`);
}

export async function addPending(email, data) {
  const k = email.toLowerCase();
  const record = { email: k, ...data, createdAt: Date.now() };
  await setJSON(`pending:${k}`, record);
  const list = await getPendingsList();
  if (!list.includes(k)) {
    list.unshift(k);   // newest first
    await setJSON(PENDINGS_LIST_KEY, list);
  }
  return record;
}

export async function removePending(email) {
  const k = email.toLowerCase();
  await del(`pending:${k}`);
  const list = await getPendingsList();
  const next = list.filter((e) => e !== k);
  await setJSON(PENDINGS_LIST_KEY, next);
}

export async function listAllPendings() {
  const list = await getPendingsList();
  const records = [];
  for (const email of list) {
    const r = await getPending(email);
    if (r) records.push(r);
  }
  return records;
}

/* Effective plan: respects plan_expires_at. Auto-downgrades expired premium. */
export function effectivePlan(user) {
  if (!user) return "free";
  if (user.plan !== "premium") return "free";
  if (user.plan_expires_at && user.plan_expires_at < Date.now()) return "free";
  return "premium";
}

export async function approvePending(email, days = 30) {
  const expiry = Date.now() + days * 24 * 60 * 60 * 1000;
  const user = await upsertUser(email, {
    plan: "premium",
    plan_expires_at: expiry,
    last_approved_at: Date.now(),
  });
  await removePending(email);
  return user;
}
