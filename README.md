# MLBoost backend-api

Node.js / Express API for **MLBoost** — an interactive platform for practicing
machine learning and data science, think **LeetCode meets Kaggle** for ML
students. Users solve ML/DS problems in the browser, run and submit code against
hidden test cases, join contests, and track progress.

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
docker build -t mlboost-api .
docker run --env-file .env -p 5001:5001 mlboost-api
```

CI enforces coverage, production audits, full-history secret scanning, and a
clean non-root Node 24 image build.
