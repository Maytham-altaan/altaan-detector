/* POST /api/upgrade/request
   Body: { method: "zaincash"|"qicard"|"bank", reference, amount, notes }
   Records a payment claim that admin will manually review. */

import { withCors } from "../_lib/cors.js";
import { getAuthEmail } from "../_lib/auth.js";
import { addPending } from "../_lib/store.js";

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "Sign in first" });

  const { method, reference, amount, notes } = req.body || {};
  if (!method || !["zaincash", "qicard", "bank"].includes(method)) {
    return res.status(400).json({ error: "method must be zaincash, qicard, or bank" });
  }
  if (!reference || String(reference).trim().length < 3) {
    return res.status(400).json({ error: "Reference / transaction number is required" });
  }

  await addPending(email, {
    method,
    reference: String(reference).trim().slice(0, 120),
    amount: Number(amount) || null,
    notes: notes ? String(notes).slice(0, 500) : "",
  });

  res.status(200).json({
    ok: true,
    message: "Payment claim received. We'll verify it and activate Premium within a few hours.",
  });
});
