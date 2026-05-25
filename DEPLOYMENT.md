# Altaan Detector — Deployment Guide

Step-by-step for shipping the freemium SaaS. Aimed at a frontend developer who hasn't run a backend before. Allow yourself 2–3 hours start to finish.

The stack:

| Piece | Service | Free tier | What it does |
|---|---|---|---|
| Frontend + Backend | **Vercel** | Yes | Hosts the React app + the `api/*` serverless functions |
| Database | **Vercel KV** (Upstash) | 256MB / 10k commands a day | Stores users + usage counters |
| AI rewrite | **Anthropic Claude** | Pay-as-you-go (cheap) | Powers the premium "AI Rewrite" feature |
| Auth emails | **Resend** | 100 emails/day, 3k/mo | Sends magic-link sign-in emails |
| Payments | **Stripe** | Pay 2.9% + 30¢/charge | Subscriptions for premium |

---

## 0. Local first — get it running without a backend

```bash
cd altaan-detector
npm install
npm run dev
```

Open <http://localhost:5173>. You should see the app. The detector and rule-based humanizer work without any backend. Sign-in and AI Rewrite will fail with network errors — that's expected until you finish the steps below.

---

## 1. Sign up for accounts

Open these in tabs. Stop after creating the account — we'll come back for keys in step 4.

1. **GitHub** — <https://github.com> (you probably already have this).
2. **Vercel** — <https://vercel.com/signup>. Sign in with GitHub.
3. **Anthropic Console** — <https://console.anthropic.com/>. Add a payment method. Drop $10 into credits — that gets you ~10,000 rewrites with Haiku.
4. **Resend** — <https://resend.com>. Sign in with GitHub.
5. **Stripe** — <https://dashboard.stripe.com/register>. Use a real business email. You can skip account activation until you actually want to take real payments; **test mode is fine for now**.

---

## 2. Push to GitHub

```bash
cd altaan-detector
git init
git add .
git commit -m "Initial commit: Altaan Detector"
gh repo create altaan-detector --private --source=. --push
```

(If you don't have `gh` installed: use the GitHub website to create a new private repo named `altaan-detector`, then `git remote add origin <url>` and `git push -u origin main`.)

---

## 3. Connect to Vercel

1. Go to <https://vercel.com/new>.
2. Choose **Import Git Repository** → select `altaan-detector`.
3. **Framework Preset**: Vite (it should detect automatically).
4. **Build Command**: `npm run build`
5. **Output Directory**: `dist`
6. Click **Deploy**. The first deploy will succeed (frontend only) but API calls will return 500 errors until you add env vars in the next step.

After the first deploy you'll get a URL like `https://altaan-detector.vercel.app`. Save it — this is your **APP_URL**.

---

## 4. Add a Vercel KV database

1. In your Vercel project, click **Storage** in the top nav.
2. Click **Create Database** → **KV**.
3. Name it `altaan-kv`. Region: closest to your users.
4. Click **Connect Project** → select `altaan-detector` → all environments. Vercel will auto-inject `KV_REST_API_URL` and `KV_REST_API_TOKEN`.

---

## 5. Get an Anthropic API key

1. <https://console.anthropic.com/settings/keys> → **Create Key** → name it `altaan-detector-prod`.
2. Copy the `sk-ant-...` value.

---

## 6. Set up Resend for sign-in emails

1. In Resend, go to **API Keys** → **Create API Key**. Permissions: "Sending access". Copy the `re_...` value.
2. **Domains** → **Add Domain** → enter your domain (e.g. `altaan.app` — you'll buy one in step 9, or skip this and use Resend's onboarding domain for testing).
3. While testing, you can use Resend's default `onboarding@resend.dev` as **AUTH_FROM_EMAIL** — it works but only sends to verified email addresses you control.

---

## 7. Set up Stripe products

1. <https://dashboard.stripe.com/test/products> → **Add product**.
2. Name: **Altaan Premium**. Add two prices:
   - **Monthly**: $9.00 USD, recurring monthly.
   - **Annual**: $59.00 USD, recurring yearly.
3. Save each, copy the **price ID** (looks like `price_1Abc...`). One for monthly, one for annual.
4. <https://dashboard.stripe.com/test/apikeys> → copy the **Secret key** (`sk_test_...`).

Webhook (do this AFTER deploying so you know your app URL):

5. <https://dashboard.stripe.com/test/webhooks> → **Add endpoint**.
6. Endpoint URL: `https://YOUR-APP-URL.vercel.app/api/stripe/webhook`
7. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
8. Save, then copy the **Signing secret** (`whsec_...`).

---

## 8. Add all env vars to Vercel

In Vercel project → **Settings** → **Environment Variables**. Add each below for **Production**, **Preview**, **Development**:

| Name | Value |
|---|---|
| `SESSION_SECRET` | A long random string. Generate one with `openssl rand -hex 32` in Terminal. |
| `APP_URL` | Your Vercel URL (e.g. `https://altaan-detector.vercel.app`) |
| `ANTHROPIC_API_KEY` | `sk-ant-...` from step 5 |
| `RESEND_API_KEY` | `re_...` from step 6 |
| `AUTH_FROM_EMAIL` | `Altaan Detector <no-reply@your-domain.com>` (or `onboarding@resend.dev` for testing) |
| `STRIPE_SECRET_KEY` | `sk_test_...` from step 7 |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 7 |
| `STRIPE_PRICE_MONTHLY` | `price_...` for the $9/mo plan |
| `STRIPE_PRICE_ANNUAL` | `price_...` for the $59/yr plan |
| `FREE_WORDS_PER_DAY` | `200` (or whatever you decide) |
| `PREMIUM_WORDS_PER_MONTH` | `50000` |

After adding env vars, go to **Deployments** → click the latest one → **Redeploy** with the box "Use existing build cache" UNCHECKED.

---

## 9. (Optional but recommended) Buy a domain

Generic web app on `vercel.app` works fine. But for marketing/SEO:

1. Buy a domain (Cloudflare Registrar is cheapest, ~$8–10/yr for `.com`).
2. In Vercel project → **Settings** → **Domains** → **Add** → enter your domain.
3. Update DNS records as instructed.
4. Update `APP_URL` env var to the new domain. Update the Stripe webhook endpoint URL too. Redeploy.

---

## 10. Test the full flow

1. Visit your live URL.
2. Click **Sign in**. Enter your email. Check inbox — open the link.
3. Click **AI Rewrite** on an AI-flagged sentence. It should rewrite. Usage meter ticks up.
4. Click **Upgrade**. Stripe Checkout opens. Use test card `4242 4242 4242 4242`, any future date, any CVC.
5. Complete checkout. You should be redirected back, and within ~10 seconds your usage meter should show "Premium · X / 50,000 words this month".

If anything breaks, the Vercel **Logs** tab shows the function output — that's where backend errors land.

---

## 11. Going live with real payments

Once you've tested in Stripe test mode and everything works:

1. Stripe Dashboard → activate your account (provide business details, tax ID, bank account).
2. Switch the dashboard from **Test mode** to **Live mode** (toggle top-right).
3. Re-create the products (or click "Activate" if they exist) and copy the **live** price IDs.
4. Get the **live** `sk_live_...` secret key.
5. Re-create the webhook endpoint in live mode, get a new `whsec_...`.
6. Update all three Stripe env vars in Vercel. Redeploy.

---

## 12. Cost model (back-of-envelope)

| Users | Free user API cost | Paying users | Stripe fees | Net per month |
|---|---|---|---|---|
| 100 free | ~$0.50 | 0 | – | –$0.50 |
| 1,000 free + 10 paid | ~$5 | $90 revenue | ~$3 | ~$82 |
| 10,000 free + 200 paid | ~$50 | $1,800 revenue | ~$60 | ~$1,690 |

Vercel + KV + Resend stay free until you have ~thousands of daily users.

The math works as long as you DON'T give the AI rewrite feature to free users beyond the daily cap. Watch the usage limits.

---

## 13. What's NOT included in this MVP

These are sensible next steps but deliberately out of scope for v1:

- **History / projects**: save past humanizations to user account.
- **Chrome extension**: paraphrase any selected text on any site.
- **Word add-in**: see-and-replace in Word docs.
- **Team plans**: shared usage pool for orgs.
- **Affiliate / referral program**.
- **Analytics**: add Plausible (`https://plausible.io`) or Vercel Analytics for traffic data.
- **Legal pages**: Terms of Service, Privacy Policy, Refund policy. **You need these before going live**. Use a generator like <https://www.termsfeed.com> — give it ~30 minutes.
- **Refund handling**: when a customer cancels in Stripe, the webhook downgrades them. For prorated refunds you'd add a button in their account page.

Build the above only after you have paying customers asking for them.

---

## Troubleshooting

**"AI rewrite failed" toast.** Check Vercel Logs for the function. Usually missing/wrong `ANTHROPIC_API_KEY` or empty credits in Anthropic Console.

**Magic link email not arriving.** In `dev` mode without `RESEND_API_KEY`, the link is logged to the Vercel function logs instead — copy from there. In production, check Resend's "Logs" tab for delivery errors.

**Stripe checkout returns user but plan stays "free".** Webhook didn't fire correctly. Check Stripe dashboard → Webhooks → your endpoint → "Recent events". If it says 4xx/5xx, click into it and read the response body — usually a signing-secret mismatch.

**Usage doesn't reset.** Daily counters expire after 48h; monthly after 35 days. They use UTC dates. If you need to force-reset, delete the `usage:{email}:{YYYYMMDD}` key in Vercel KV.
