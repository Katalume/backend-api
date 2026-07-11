# MLBoost backend-api

Node.js / Express API for **MLBoost** — an interactive platform for practicing
machine learning and data science, think **LeetCode meets Kaggle** for ML
students. Users solve ML/DS problems in the browser, run and submit code against
hidden test cases, join contests, and track progress.

This service handles auth, problems, contests, leaderboards, and the
running/judging of user code submissions through [Judge0](https://judge0.com/).

## Stack

- Express 5 + Mongoose 9 (MongoDB)
- JWT auth (access token in `Authorization` header, refresh token in an httpOnly cookie)
- Judge0 for sandboxed code execution
- helmet, express-rate-limit, express-validator for hardening

## Getting started

Requirements: Node 18+, MongoDB, and a reachable Judge0 instance.

```bash
npm install
cp .env.example .env      # then fill in the values
npm run dev               # or: npm start
```

The server listens on `BACKEND_PORT` (default 5001). Health check: `GET /health`.

### Environment

All configuration is via environment variables — see [.env.example](.env.example).
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` are **required in production**; the
server refuses to start without them. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Seeding

```bash
# Create a sample problem + test cases
node scripts/seedProblem.js

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
| Runner | `/api/runner/run` | run code against custom input, no save (rate limited) |
| Submissions | `/api/submissions` | submit + judge; `GET` supports `?problemId=&limit=` (rate limited) |
| Contests | `/api/contests` | contest CRUD + registration |
| Admin | `/api/admin` | stats etc. (Admin role) |

## Judge0

The vendored config lives in `judge0/`. Set a real `AUTHN_TOKEN` in `judge0.conf`
and the matching `JUDGE0_AUTH_TOKEN` in your `.env`, and do not expose Judge0's
port publicly — it runs untrusted code.

## Testing

```bash
npm test
```

Integration tests run with Jest + supertest against an in-memory MongoDB
(`mongodb-memory-server`) — no external database needed. Judge0 is mocked, so
tests never execute real code. Coverage includes the auth flow, authorization
(ownership/admin checks), input validation, the execution guard, and the
submissions endpoint. CI runs the suite on every push/PR to `main`.

## Docker

```bash
docker build -t mlboost-api .
docker run --env-file .env -p 5001:5001 mlboost-api
```

## Known follow-ups

- Judging currently runs synchronously inside the request. Moving it to a
  Redis-backed queue/worker (scaffolding exists in `src/workers/`) is the main
  scalability item.
