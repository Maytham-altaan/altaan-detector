/* POST /api/admin/approve
   Body: { email, days?: number (default 30) }
   Marks the user as premium for `days` days, removes their pending request.
   Admin-only. */

import { withCors } from "../_lib/cors.js";
import { getAuthEmail, isAdmin } from "../_lib/auth.js";
import { approvePending, removePending } from "../_lib/store.js";

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const adminEmail = getAuthEmail(req);
  if (!adminEmail) return res.status(401).json({ error: "Sign in first" });
  if (!isAdmin(adminEmail)) return res.status(403).json({ error: "Admin only" });

  const { email, days, action } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  if (action === "reject") {
    await removePending(email);
    return res.status(200).json({ ok: true, action: "rejected" });
  }

  const user = await approvePending(email, Number(days) || 30);
  res.status(200).json({ ok: true, action: "approved", user });
});
