/* GET /api/admin/list-pending
   Returns all pending payment claims. Admin-only. */

import { withCors } from "../_lib/cors.js";
import { getAuthEmail, isAdmin } from "../_lib/auth.js";
import { listAllPendings } from "../_lib/store.js";

export default withCors(async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "Sign in first" });
  if (!isAdmin(email)) return res.status(403).json({ error: "Admin only" });

  const pendings = await listAllPendings();
  res.status(200).json({ pendings });
});
