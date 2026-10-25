# Karya

Personal engineering cockpit: estimate Jira tickets with PERT + risk, slice them into timed pieces, run them against a radial timer, and calibrate future estimates from actuals.

## Features

- Read-only Jira inbox (OAuth 2.0 3LO): only tickets assigned to you, never written back to Jira
- Estimate tab: O/M/P PERT, pain-point risk weights, AI risk analyzer, live estimation receipt, target in focus days
- Execute tab: AI or manual slicing, concentric radial timer with pacing ring, colour states, buffer shield, scope-creep catcher with bonus slices and a standup copy
- Calibrate tab: per-ticket receipt, fudge factor, pain-point auto-tuner, phase overrun heatmap, scope stats (pure math, no AI)
- AI through [kunji](https://kunji.pknspace.com): each person uses their own AI key saved there (Anthropic, OpenAI, Gemini, Groq or any OpenAI-compatible API); karya holds no AI keys and never uses a shared one
- Jira tokens are encrypted at rest (AES-GCM) and never returned to the browser
- Demo tickets to try everything without Jira
- Only emails in `ALLOWED_EMAILS` can sign up or sign in; each user sees only their own data

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui · React Router · Convex · Convex Auth · kunji AI gateway · zod · Vitest

## Development

Node 22.18+ (`.nvmrc`). Dev uses a local Convex backend on this machine. Jira needs an Atlassian OAuth app (see [Jira OAuth app](#jira-oauth-app)); without one, use **Load demo tickets** in the sidebar.

```bash
cd shared && npm install && cd ..
cd backend && npm install
printf 'VITE_CONVEX_URL=\n' > .env.local   # fresh clone only: keeps the URL's name
npm run dev                                # local Convex backend, leave running
# in another terminal, once per deployment (see backend/.env.example):
npm run setup:auth
npx convex env set SITE_URL http://localhost:5173
npx convex env set ALLOWED_EMAILS you@example.com
openssl rand -base64 32 | tr -d '\n' | npx convex env set ENCRYPTION_KEY
npx convex env set JIRA_CLIENT_ID <client id>
npx convex env set JIRA_CLIENT_SECRET <secret>
npx convex env set JIRA_REDIRECT_URI http://127.0.0.1:3211/jira/callback
npx convex env set KUNJI_URL http://127.0.0.1:3211        # kunji's local backend site URL (see below)
npx convex env set KUNJI_SECRET kjs_...                      # karya's secret from kunji's Apps page
cd ../web && npm install && npm run dev    # http://localhost:5173
```

Then sign up, open **Settings** and connect Jira. For AI, run kunji locally too and save a key on its **AI keys** page with the same email. When both run, the backend started second takes the next ports (3212/3213), so check `CONVEX_SITE_URL` in the other's `backend/.env.local` for `KUNJI_URL` (and use that port in `JIRA_REDIRECT_URI` if karya is the one on 3213).

## Scripts

| Command | What it does |
|---|---|
| `scripts/check.sh` | Typecheck, lint and test every part |
| `scripts/deploy.sh` | Deploy Convex to production, build and upload the site (`DRY_RUN=1` previews) |
| `backend/`: `npm run dev` | Local Convex backend |
| `backend/`: `npm run setup:auth` | Set `JWT_PRIVATE_KEY` / `JWKS` (add `-- --prod` for production) |
| `backend/`: `npm run check` | Typecheck and lint the Convex functions |
| `web/`: `npm run dev` | Vite dev server on :5173 |
| `web/`: `npm run build` | Typecheck and build `web/dist` |
| `web/`: `npm run check` | Typecheck, lint and test the web app |
| `shared/`: `npm test` | Unit tests for the pure logic (PERT, ADF, slicing, timer, dial arcs, calibration) |

## Deployment

`scripts/deploy.sh` runs the checks, deploys `backend/convex` to the Convex production deployment while building `web/` against it, refuses to upload unless the bundle points at `convex.cloud`, then rsyncs `web/dist/` to the VPS. `DRY_RUN=1 scripts/deploy.sh` previews.

Production settings live in git-ignored `.env.prod.local` files (`chmod 600`, read line by line, never sourced); see the `.env.example` next to each:

- `backend/.env.prod.local`: `CONVEX_DEPLOY_KEY`, created with
  ```bash
  cd backend && npx convex deployment token create karya-deploy --deployment praveen-nirmalkar:karya:production --save-env .env.prod.local
  ```
- `web/.env.prod.local`: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_DIR=/var/www/karya`.

Production Convex env vars (`npx convex env set --prod ...`): `JWT_PRIVATE_KEY` / `JWKS` (`npm run setup:auth -- --prod`), `SITE_URL=https://karya.pknspace.com`, `ALLOWED_EMAILS`, its own `ENCRYPTION_KEY`, `JIRA_CLIENT_ID`, `JIRA_CLIENT_SECRET` and `JIRA_REDIRECT_URI=https://<deployment>.convex.site/jira/callback`.

Caddy serves the static files with an SPA fallback:

```caddy
http://karya.pknspace.com:8080 {
      root * /var/www/karya
      try_files {path} /index.html
      encode gzip
      file_server
}
```

## How it works

- **Layout:** `backend/convex` (Convex functions and schema), `shared/` (pure TypeScript used by both), `web/` (Vite app). Each has its own `.env.example`.
- **Auth:** Convex Auth password provider; `ALLOWED_EMAILS` is checked at sign-up/sign-in and on every request. Every query and mutation validates its arguments and checks the record belongs to the caller.
- **Secrets:** `ENCRYPTION_KEY` (32 random bytes, base64) encrypts Jira tokens with AES-GCM. They are decrypted only inside actions; queries return flags such as `jiraConnected`. Changing the key makes saved tokens unreadable, so you would reconnect Jira.
- **AI:** `lib/kunji.ts` calls kunji's gateway (`POST $KUNJI_URL/ai/v1/generate`, `Authorization: Bearer $KUNJI_SECRET`) with the user's email, the `fast` model alias and a JSON Schema; kunji picks the user's own key (preferred provider, then fallback) and rate-limits. Replies are validated with zod, with one retry on an unreadable one. With no key saved in kunji, the app shows "Add your AI key at kunji.pknspace.com". `KUNJI_SECRET` comes from kunji's admin **Apps** page; `KUNJI_URL` is kunji's `https://<deployment>.convex.site`.
- **Timer:** slices store elapsed seconds plus the start timestamp of the running stretch, so time is computed from timestamps, not ticks, and survives reloads and sleep.

### Jira OAuth app

1. At [developer.atlassian.com/console/myapps](https://developer.atlassian.com/console/myapps) create an **OAuth 2.0 integration**.
2. **Permissions → Jira API:** add `read:jira-work` and `read:jira-user`. Karya also asks for `offline_access` to get a refresh token. It never writes to Jira.
3. **Authorization → callback URLs:** add both
   - `http://127.0.0.1:3211/jira/callback` (local)
   - `https://<deployment>.convex.site/jira/callback` (production, the Convex HTTP actions URL)
4. **Settings:** copy the client ID and secret into `JIRA_CLIENT_ID` / `JIRA_CLIENT_SECRET` on each deployment.

### Code map

| Path | What it holds |
|---|---|
| `backend/convex/schema.ts` | Tables: tickets, slices, timer events, scope-creep items, pain-point weights, settings |
| `backend/convex/jira.ts`, `lib/jira.ts`, `http.ts` | OAuth connect and callback, token refresh, ticket sync |
| `backend/convex/ai.ts`, `lib/kunji.ts` | Risk analyzer and slicing through the kunji gateway |
| `backend/convex/estimates.ts` | Saving estimates, AI factors |
| `backend/convex/slices.ts`, `scope.ts` | Plan, timer, buffer, scope creep, ticket completion |
| `backend/convex/calibration.ts` | Receipt and calibration overview, weight tuning |
| `backend/convex/lib/` | Access checks, allowlist, secrets, defaults, demo tickets |
| `shared/` | PERT, ADF→text, slicing and timer math, scope and calibration math, crypto |
| `web/src/pages/`, `web/src/components/` | Pages and the Estimate / Execute / Calibrate tabs |
