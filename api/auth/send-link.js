/* POST /api/auth/send-link
   Body: { email }
   Emails a one-click sign-in URL with a short-lived token.
   Uses Resend if RESEND_API_KEY is set; in dev without a key it logs to console. */

import { withCors, readJSON } from "../_lib/cors.js";
import { signToken } from "../_lib/auth.js";

const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.AUTH_FROM_EMAIL || "Altaan Detector <no-reply@altaan.app>";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { email } = await readJSON(req);
  if (!email || !/^.+@.+\..+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email" });
  }

  /* 15-minute magic token used only for the sign-in step. */
  const linkToken = signToken({ email, kind: "magic" }, 15 * 60);
  const url = `${APP_URL}/?token=${encodeURIComponent(linkToken)}`;

  if (!RESEND_KEY) {
    console.log("[DEV] Magic link for", email, "->", url);
    return res.status(200).json({ sent: true, devUrl: url });
  }

  const body = {
    from: FROM_EMAIL,
    to: [email],
    subject: "Your Altaan Detector sign-in link",
    text:
`Click this link to sign in to Altaan Detector:

${url}

This link expires in 15 minutes. If you didn't request it, ignore this email.`,
    html:
`<p>Click this link to sign in to <strong>Altaan Detector</strong>:</p>
<p><a href="${url}" style="background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-family:sans-serif">Sign in</a></p>
<p style="color:#64748b;font-size:13px">This link expires in 15 minutes. If you didn't request it, you can ignore this email.</p>`,
  };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const errText = await r.text();
    console.error("Resend error", r.status, errText);
    return res.status(502).json({ error: "Could not send email" });
  }
  res.status(200).json({ sent: true });
});
