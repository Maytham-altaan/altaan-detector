# Altaan Detector

AI humanizer and detector. Free tier = rule-based word/phrase swapping + sentence-level AI scoring. Premium = real LLM-backed sentence rewrites.

Built as a competitor to QuillBot at a fraction of the price ($9/mo vs $20/mo).

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

## Project layout

```
altaan-detector/
├─ src/
│  ├─ App.jsx                  # Top bar, modals, routes auth callbacks
│  ├─ main.jsx                 # React entry
│  ├─ styles.css               # Global styles
│  ├─ components/
│  │  ├─ Humanizer.jsx         # Detector + word/phrase humanizer + AI Rewrite UI
│  │  ├─ AuthModal.jsx         # Magic-link sign-in
│  │  ├─ UpgradeModal.jsx      # Stripe Checkout entry
│  │  ├─ UsageMeter.jsx        # Top-bar usage pill
│  │  └─ humanizer.css
│  ├─ data/
│  │  ├─ lexicon.js            # AI vocabulary + phrase database
│  │  └─ thesaurus.js          # Offline thesaurus
│  └─ lib/
│     ├─ analysis.js           # Tokenise / detect / score / inflect
│     ├─ api.js                # Backend fetch wrappers
│     └─ useUser.js            # Session hook
├─ api/
│  ├─ rewrite.js               # POST: Claude proxy with usage tracking
│  ├─ me.js                    # GET: current user + usage
│  ├─ auth/
│  │  ├─ send-link.js          # POST: send magic-link email
│  │  └─ verify.js             # POST: exchange magic token for session
│  ├─ stripe/
│  │  ├─ checkout.js           # POST: start Stripe Checkout
│  │  └─ webhook.js            # POST: handle subscription state changes
│  └─ _lib/                    # Shared backend helpers
├─ DEPLOYMENT.md               # Step-by-step deploy guide
├─ .env.example                # Required environment variables
└─ vercel.json
```

## Going live

See [DEPLOYMENT.md](./DEPLOYMENT.md). Allow 2–3 hours.

## License

Private — all rights reserved.
