/* GET /api/me — returns the current user with usage. */
import { withCors } from "./_lib/cors.js";
import { getAuthEmail, isAdmin } from "./_lib/auth.js";
import { getUser, getUsage, upsertUser, effectivePlan, getPending } from "./_lib/store.js";

export default withCors(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "Not signed in" });
  const user = (await getUser(email)) || (await upsertUser(email));
  const plan = effectivePlan(user);
  const usage = await getUsage(email, plan);
  const pending = await getPending(email);
  res.status(200).json({
    email: user.email,
    plan,
    plan_expires_at: user.plan_expires_at || null,
    usage,
    pending: pending ? { method: pending.method, createdAt: pending.createdAt } : null,
    is_admin: isAdmin(email),
  });
});
