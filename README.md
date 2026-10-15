# Karya

Personal engineering cockpit: estimate Jira tickets with PERT + risk, slice them into timed pieces, run them against a radial timer, and calibrate future estimates from actuals.

## Features

- Read-only Jira inbox (OAuth 2.0 3LO): tickets assigned to you, never written back
- Estimate tab: O/M/P PERT, pain-point risk weights, Gemini risk analyzer, live receipt
- Execute tab: AI or manual slicing, concentric radial timer, buffer shield, scope-creep catcher
- Calibrate tab: fudge factor, pain-point auto-tuner, overrun heatmap
- Bring your own Gemini key; secrets are encrypted at rest
- Only emails in `ALLOWED_EMAILS` can sign up or sign in; each user sees only their own data

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · Convex · Convex Auth · Gemini (`@google/genai`) · zod · Vitest

## Development

Node 22.18+ (`.nvmrc`). Dev uses a local Convex backend on this machine.

```bash
cd shared && npm install && cd ..
cd backend && npm install
printf 'VITE_CONVEX_URL=\n' > .env.local   # fresh clone only: keeps the URL's name
npm run dev                                # local Convex backend, leave running
# in another terminal, once per deployment (see backend/.env.example):
npm run setup:auth
npx convex env set SITE_URL http://localhost:5173
npx convex env set ALLOWED_EMAILS you@example.com
openssl rand -base64 32 | npx convex env set ENCRYPTION_KEY
cd ../web && npm install && npm run dev
```

## Scripts

| Command | What it does |
|---|---|
| `scripts/check.sh` | Typecheck, lint and test every part |
| `scripts/deploy.sh` | Deploy Convex to production, build and upload the site (`DRY_RUN=1` previews) |
| `backend/`: `npm run dev` | Local Convex backend |
| `backend/`: `npm run setup:auth` | Set `JWT_PRIVATE_KEY` / `JWKS` (add `--prod`) |
| `web/`: `npm run dev` | Vite dev server on :5173 |
| `shared/`: `npm test` | Unit tests for the pure math |

## Deployment

Filled in at milestone 8.

## How it works

- **Layout:** `backend/convex` (Convex functions and schema), `shared/` (pure TypeScript used by both: PERT, calibration, slicing), `web/` (Vite app). Each has its own `.env.example`.
- **Auth:** Convex Auth password provider; `ALLOWED_EMAILS` is checked at sign-up/sign-in and on every request.
