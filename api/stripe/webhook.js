/* POST /api/stripe/webhook
   Stripe POSTs subscription events here. We update the user's plan
   ("free" ↔ "premium") accordingly. */

import crypto from "node:crypto";
import { withCors } from "../_lib/cors.js";
import { upsertUser, getJSON } from "../_lib/store.js";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/* Verify the Stripe signature header. */
function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map(p => p.split("=")));
  if (!parts.t || !parts.v1) return false;
  const payload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
}

/* Read body as raw text — we need the exact bytes Stripe signed. */
async function readRaw(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return await new Promise(resolve => {
    let data = ""; req.on("data", c => (data += c)); req.on("end", () => resolve(data));
  });
}

/* Look up the email tied to a stripe customer id by scanning the user index.
   For a small SaaS this is fine; at scale add a reverse map customer:{id} -> email. */
async function emailFromCustomer(customerId) {
  /* We store stripeCustomerId on the user. Without a reverse index, fetch
     the customer object from Stripe to read the email Stripe has on file. */
  const r = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  });
  if (!r.ok) return null;
  const c = await r.json();
  return c.email || null;
}

export const config = { api: { bodyParser: false } };

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!WEBHOOK_SECRET) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not set" });

  const raw = await readRaw(req);
  const sig = req.headers["stripe-signature"];
  if (!verifyStripeSignature(raw, sig, WEBHOOK_SECRET)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return res.status(400).json({ error: "Bad JSON" }); }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const obj = event.data.object;
        const customerId = obj.customer;
        const status = obj.status || (obj.subscription_status);
        const isActive = ["active", "trialing"].includes(status) ||
                         event.type === "checkout.session.completed";
        const email = await emailFromCustomer(customerId);
        if (email) {
          await upsertUser(email, {
            plan: isActive ? "premium" : "free",
            stripeCustomerId: customerId,
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const obj = event.data.object;
        const email = await emailFromCustomer(obj.customer);
        if (email) await upsertUser(email, { plan: "free" });
        break;
      }
      default: /* ignore */ break;
    }
    res.status(200).json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    res.status(500).json({ error: "Webhook handler failed" });
  }
});
