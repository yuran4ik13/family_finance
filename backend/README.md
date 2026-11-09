# Family Finance · Backend (API)

Server for the website and the iPhone app: sign-in, Monobank sync,
categories, rules, reports. Node.js + Express + TypeScript, PostgreSQL via Prisma.

## Run it locally

```bash
cd backend
npm ci
cp .env.example .env      # then fill in your own values (never commit .env)
npx prisma migrate deploy # create / update database tables
npx prisma generate       # generate the Prisma client
npm run create-user -- you@example.com   # your login (password is asked hidden)
npm run dev               # http://localhost:3000
```

Required secrets in `.env`: `JWT_SECRET` (`openssl rand -base64 48`) and
`ENCRYPTION_KEY` (`openssl rand -base64 32`). After signing in, open
**Settings** and paste your Monobank token.

Forgot the password? Set a new one (all sessions are signed out):

```bash
NEW_USER_PASSWORD='new-long-password' npm run create-user -- you@example.com
```

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the server and restart on every change |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Security tests (needs an empty database whose name contains `test`) |
| `npm run seed:demo` | Read-only demo login with invented data (`DEMO_EMAIL`, `DEMO_PASSWORD`) |
| `npx prisma migrate deploy` | Apply new migrations (never `migrate dev` on real data) |

## Folders

```
backend/
├── prisma/         # database schema and migrations
├── scripts/
│   ├── create-user.ts          # create a login / reset a password
│   ├── seed-demo.ts            # demo login with fake data
│   └── import-env-settings.ts  # one-time move of old .env settings
├── src/
│   ├── app.ts        # Express app: middleware order and routers
│   ├── index.ts      # starts the server
│   ├── routes/       # finance, monobank sync, settings & account
│   ├── categorize.ts # per-user categorization rules
│   ├── auth.ts       # login, sign up, sessions, access checks
│   ├── security.ts   # Helmet, CORS, CSRF protection, rate limits, errors
│   ├── crypto.ts     # AES-256-GCM encryption of bank tokens
│   ├── audit.ts      # security log
│   ├── config.ts     # validates .env at startup
│   ├── password.ts   # scrypt hashing + password policy
│   ├── monobank.ts   # Monobank API client (per-token rate limit)
│   ├── analytics.ts  # analytics reports
│   └── prisma.ts     # database client
├── tests/          # security tests: users can't reach each other's data
└── .env.example    # environment variables template
```

## API in short

All routes except `/api/auth/*` need a signed-in user and return only that user's data.
Requests that change data must send `X-Requested-With: family-finance` (CSRF protection).

| Area | Routes |
|---|---|
| Auth | `POST /api/auth/login`, `register`, `logout`, `logout-all`, `change-password`, `GET /api/auth/me` |
| Data | `GET /api/accounts/summary`, `/api/categories`, `/api/transactions/simple`, `PATCH /api/transactions/:id` |
| Rules | `GET/POST/PATCH/DELETE /api/merchant-rules`, `POST /api/transactions/recategorize` |
| Reports | `GET /api/reports/summary`, `/api/reports/expenses`, `/api/reports/analytics` |
| Bank | `POST /api/monobank/sync-accounts`, `/api/monobank/sync-all-transactions` |
| Settings | `GET /api/settings`, `PUT/DELETE /api/settings/monobank`, `GET /api/account/export`, `DELETE /api/account` |
