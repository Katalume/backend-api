# Zero-cost public beta

This profile runs Katalume's accounts, catalog, progress, and learning APIs at
zero infrastructure cost. Practice code executes locally in the browser; the
API deliberately rejects ranked/server execution until a dedicated sandbox is
funded.

## Services

- Vercel Hobby: Next.js frontend and same-origin API/OAuth gateway.
- Render Free web service: this Node API, deployed from `render.yaml`.
- MongoDB Atlas M0: durable application data.
- Upstash Redis Free: rate-limit coordination.
- Google and GitHub OAuth: direct provider integrations.

No payment method is required for this profile. Do not add a paid Render
instance, custom domain, Droplet, or managed Judge0 plan.

## Security and behavior

- `EXECUTION_MODE=disabled` is mandatory. POST requests that would enqueue
  untrusted server execution return `503 SERVER_EXECUTION_UNAVAILABLE`.
- Practice execution uses the frontend's browser worker and is never accepted
  as authoritative contest or leaderboard evidence.
- `COOKIE_DOMAIN` stays blank. OAuth starts and returns through the frontend's
  same-origin `/api` gateway, so cookies belong to its `vercel.app` hostname.
- Atlas and Upstash connections use TLS. Secrets exist only in provider
  settings, never in Git or `NEXT_PUBLIC_` variables.
- Render Free can sleep, cold-start, restart, or suspend at its documented
  limits. The frontend must show a recoverable warm-up state.

## Required environment values

The Render Blueprint declares every key. Provide secret values for MongoDB,
Redis, JWT signing, and configured OAuth providers. Set all three public URLs
to the exact Vercel production origin:

```text
CORS_ORIGIN=https://YOUR-PROJECT.vercel.app
OAUTH_CALLBACK_BASE_URL=https://YOUR-PROJECT.vercel.app
FRONTEND_URL=https://YOUR-PROJECT.vercel.app
```

Provider callback URLs use the same public origin:

```text
https://YOUR-PROJECT.vercel.app/api/auth/oauth/google/callback
https://YOUR-PROJECT.vercel.app/api/auth/oauth/github/callback
```

Vercel needs only server-side `BACKEND_API_URL` pointing at the Render service
with `/api` appended, plus the live-mode public values documented by the
frontend repository.

## Upgrade path

`EXECUTION_MODE` is an adapter boundary. When paid isolated compute is approved,
deploy the reviewed Judge0 topology in `deploy/production`, set
`EXECUTION_MODE=judge0`, provide `JUDGE0_URL` and `JUDGE0_AUTH_TOKEN`, start the
durable worker, and enable ranked submissions. The data and API contracts do
not need to change.
