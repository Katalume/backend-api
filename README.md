# Katalume backend-api

**Practice machine learning into mastery.**

Katalume is the training ground for machine learning — solve real ML problems
in an in-browser judge, compete in contests, and climb to mastery. LeetCode
rigor meets Kaggle depth.

The name combines **kata**, deliberate practice that forges mastery, with
**lume**, light or illumination—the moment a hard problem clicks.

This service handles auth, problems, contests, leaderboards, and the
running/judging of user code submissions through [Judge0](https://judge0.com/).

## Stack

- Express 5 + Mongoose 9 (MongoDB)
- Rotating server-tracked JWT Sessions in Secure/HttpOnly cookies
- Durable MongoDB evaluation jobs and separate Judge0 worker process
- Redis distributed throttling, Helmet, validation and audit controls

## Getting started

Requirements: Node 24, MongoDB, Redis, and a private authenticated Judge0.

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # or: npm start
npm run worker            # separate terminal/process for evaluations
```

The server listens on `BACKEND_PORT` (default 5001). Liveness is `/health` and
Mongo/Redis readiness is `/ready`.

### Environment

All configuration is via environment variables — see [.env.example](.env.example).
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are **required in production**; the
server refuses to start without them. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Seeding

```bash
# Apply indexes/data migration, then versioned idempotent launch content
npm run migrate
npm run seed

# Bootstrap an admin (signup can only create User/Organization roles)
ADMIN_EMAIL=you@example.com ADMIN_USERNAME=admin ADMIN_PASSWORD='a-strong-password' \
  node scripts/seedAdmin.js
```

## API overview

| Area | Base path | Notes |
|------|-----------|-------|
| Auth | `/api/auth` | signup, login, refresh, logout (rate limited) |
| Users | `/api/users` | `me`, plus admin/owner-scoped user management |
| Problems | `/api/problems` | public list + fetch by slug |
| Runner | `/api/runner` | queue/poll sample/custom execution jobs |
| Submissions | `/api/submissions` | idempotent queue, status, history and cancellation |
| Contests | `/api/contests` | contest CRUD + registration |
| Admin | `/api/admin` | stats etc. (Admin role) |

## Judge0

Set a strong Judge0 `AUTHN_TOKEN` and matching backend `JUDGE0_AUTH_TOKEN`. Keep
port 2358 private, deny user-program network access, and bound every resource.
The bundled Compose manifest binds it to loopback by default; production must
set `JUDGE0_BIND_ADDRESS` to the isolated host's private VPC address.

## Testing

```bash
npm test
```

Integration tests run with Jest + supertest against an in-memory MongoDB
(`mongodb-memory-server`) — no external database needed. Judge0 is mocked, so
tests never execute real untrusted code. Coverage includes rotation/reuse,
authorization, input guards, Judge0 polling/resources, durable job failure
recovery, idempotency, contests, migrations/seeds, audit and account lifecycle.
CI runs the suite and enforced thresholds on every push/PR to `main`.

## Docker

```bash
docker build -t katalume-api .
docker run --env-file .env -p 5001:5001 katalume-api
```

The current zero-cost launch profile is documented in
[`deploy/free-beta`](deploy/free-beta/README.md). It keeps server execution
disabled and uses the frontend's browser sandbox for unranked practice. The
reviewed two-host Judge0 topology remains in [`deploy/production`](deploy/production/README.md)
as the clean paid upgrade path.

CI enforces coverage, production audits, full-history secret scanning, and a
clean non-root Node 24 image build.
