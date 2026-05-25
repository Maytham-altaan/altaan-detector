/* POST /api/auth/verify
   Body: { token }   (the magic-link token)
   Returns: { token } = a 30-day session token.
   Creates the user record if it doesn't exist. */

import { withCors, readJSON } from "../_lib/cors.js";
import { verifyToken, signToken } from "../_lib/auth.js";
import { upsertUser } from "../_lib/store.js";

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { token } = await readJSON(req);
  if (!token) return res.status(400).json({ error: "Missing token" });
  const payload = verifyToken(token);
  if (!payload || payload.kind !== "magic" || !payload.email) {
    return res.status(401).json({ error: "Invalid or expired link" });
  }
  await upsertUser(payload.email);
  const session = signToken({ email: payload.email, kind: "session" });
  res.status(200).json({ token: session });
});
