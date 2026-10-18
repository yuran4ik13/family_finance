<h1 align="center">💰 family_finance</h1>

<p align="center">
  <b>All your accounts in one place, with a smart assistant that helps you spend better.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white" />
  <img src="https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/status-in%20development-orange?style=flat-square" />
</p>

---

## 🎯 About

family_finance is a personal finance tracker I'm actively building, with the goal of turning it into a product that **anyone who wants to track and control their finances can use**.

People keep their money in many places: different banks, cards and crypto wallets. That makes it hard to answer a simple question: *"Where does my money actually go?"*

With family_finance, a user **connects all their accounts once** and gets **one convenient dashboard** with every expense, without switching between apps or filling in spreadsheets.

## 📸 Screenshots

> All screenshots use **generated demo data** (`npm run seed:demo`), not real transactions.

<p align="center">
  <img src="docs/analytics-dark.png" width="900" alt="Analytics page, dark theme" />
</p>

<p align="center">
  <img src="docs/dashboard-light.png" width="440" alt="Dashboard, light theme" />
  <img src="docs/transactions-light.png" width="440" alt="Transactions list" />
</p>

## ✅ Features

**Working now**

- 🏦 **Monobank integration**: syncs accounts and transactions automatically, including history backfill
- 🏷️ **Auto-categorization**: transactions are sorted into categories (groceries, transport, subscriptions, …)
- 🧠 **Merchant rules**: teach the app once how to categorize a merchant, and it remembers
- 🔁 **Transfer detection**: transfers between your own cards are not counted as expenses
- 📊 **Analytics page**: spending by category, income vs. expenses by day, top merchants, comparison with the previous period
- 👨‍👩‍👧 **Family members**: accounts can belong to different family members
- 🌗 **Light / dark theme**
- 🔐 **Login with email + password**, read-only demo account

**Coming next**

- 🏦 PrivatBank integration
- 🪙 Crypto transactions tracking
- 🤖 **AI financial assistant** that analyzes spending, finds ways to optimize expenses and gives personal advice

## 🛠 Tech stack

| Part | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | Node.js, Express, TypeScript, Zod |
| Security | scrypt password hashing, JWT in httpOnly cookies, Helmet, rate limiting |
| Database | PostgreSQL, Prisma ORM |
| Integrations | Monobank API |

## 📁 Project structure

```
family_finance/
├── backend/            # Express API + Prisma
│   ├── prisma/         # database schema and migrations
│   ├── scripts/
│   │   ├── create-user.ts  # create a login from the terminal
│   │   └── seed-demo.ts    # fill the DB with fake demo data
│   ├── src/
│   │   ├── index.ts      # API routes, sync and categorization logic
│   │   ├── auth.ts       # login, logout, session cookie, access checks
│   │   ├── security.ts   # Helmet, CORS, CSRF check, rate limits, errors
│   │   ├── config.ts     # validates .env at startup
│   │   ├── password.ts   # scrypt password hashing
│   │   ├── monobank.ts   # Monobank API client
│   │   ├── analytics.ts  # analytics reports
│   │   └── prisma.ts     # database client
│   └── .env.example    # environment variables template
├── docs/               # screenshots
└── frontend/           # React app
    └── src/
        ├── AuthGate.tsx    # shows login until the user is signed in
        ├── LoginPage.tsx
        ├── api.ts          # all requests to the backend
        ├── App.tsx
        └── AnalyticsPage.tsx
```

## 🚀 Getting started

**Requirements:** Node.js 20+, PostgreSQL, a personal Monobank token from [api.monobank.ua](https://api.monobank.ua)

**1. Clone the repository**

```bash
git clone https://github.com/yuran4ik13/family_finance.git
cd family_finance
```

**2. Set up the backend**

```bash
cd backend
npm install
cp .env.example .env      # then fill in your own values (JWT_SECRET is required)
npx prisma migrate dev    # create database tables
npx prisma generate       # generate the Prisma client
npm run create-user -- you@example.com   # create your login (password is asked hidden)
npm run dev               # http://localhost:3000
```

Generate a `JWT_SECRET` with `openssl rand -base64 48`.

**3. Set up the frontend** (in a new terminal)

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

**4. (Optional) Try it with fake data**

Use a **separate, empty database** for this (e.g. `family_finance_demo` in `DATABASE_URL`):

```bash
cd backend
DEMO_EMAIL=demo@example.com DEMO_PASSWORD='choose-a-long-password' npm run seed:demo
```

This creates invented family members, cards and ~200 transactions, plus a **read-only** demo login.
The script refuses to run on a database that already has transactions.

## 🔐 Security

- **Login required** for every API route; there is no public sign-up, accounts are created from the server terminal
- Passwords are stored only as **scrypt hashes** (salted, slow to brute force)
- The session is a signed token in an **httpOnly, SameSite=Strict cookie** (Secure over HTTPS): page scripts can't read it, other sites can't use it
- **Brute-force protection**: max 5 failed logins per email+IP per 15 min, plus general API rate limits
- **CSRF protection**: data-changing requests from foreign origins are rejected
- **Input validation** with Zod; request bodies limited to 100 KB
- **Security headers** with Helmet; errors never leak stack traces
- **Read-only demo role**: a public demo can't change data or trigger bank syncs
- **Log out everywhere**: changing the password or calling `/api/auth/logout-all` invalidates all sessions
- All secrets (database URL, bank tokens, JWT secret, personal categorization rules) live in `.env`, which is **never committed**; the server refuses to start with a missing or weak `JWT_SECRET`
- Bank tokens are used **only on the backend**; the frontend never sees them
- **Dependabot** keeps dependencies updated, CI runs type checks and `npm audit`

Found a security problem? See [SECURITY.md](SECURITY.md).

## 👤 Author

**Yura**: junior full stack developer, Košice 🇸🇰
GitHub: [@yuran4ik13](https://github.com/yuran4ik13)
