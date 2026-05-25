/* POST /api/stripe/checkout
   Body: { plan: "monthly" | "annual" }
   Auth: Bearer <session-token>
   Returns: { url } — redirect the user to Stripe Checkout.
   Uses Stripe REST directly so we don't need the stripe-node SDK. */

import { withCors, readJSON } from "../_lib/cors.js";
import { getAuthEmail } from "../_lib/auth.js";
import { getUser, upsertUser } from "../_lib/store.js";

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
const PRICE_ANNUAL = process.env.STRIPE_PRICE_ANNUAL;
const APP_URL = process.env.APP_URL || "http://localhost:5173";

async function stripePost(path, params) {
  const body = new URLSearchParams();
  function add(prefix, obj) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) add(key, v);
      else if (Array.isArray(v)) v.forEach((vv, i) => add(`${key}[${i}]`, vv));
      else body.append(key, String(v));
    }
  }
  add("", params);
  const r = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || `Stripe ${path} failed`);
  return json;
}

export default withCors(async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!STRIPE_KEY) return res.status(500).json({ error: "STRIPE_SECRET_KEY not set" });
  const email = getAuthEmail(req);
  if (!email) return res.status(401).json({ error: "Not signed in" });

  const { plan = "monthly" } = await readJSON(req);
  const priceId = plan === "annual" ? PRICE_ANNUAL : PRICE_MONTHLY;
  if (!priceId) return res.status(500).json({ error: "Stripe price ID not configured" });

  const user = (await getUser(email)) || (await upsertUser(email));

  /* Create or reuse a customer */
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripePost("customers", { email });
    customerId = customer.id;
    await upsertUser(email, { stripeCustomerId: customerId });
  }

  /* Create checkout session */
  const session = await stripePost("checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": 1,
    success_url: `${APP_URL}/?upgraded=1`,
    cancel_url: `${APP_URL}/?cancelled=1`,
    allow_promotion_codes: "true",
  });

  res.status(200).json({ url: session.url });
});
