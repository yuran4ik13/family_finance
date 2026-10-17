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

<!-- Add a screenshot here (use demo data, not real transactions):
<p align="center"><img src="docs/screenshot.png" width="800" /></p>
-->

## ✅ Features

**Working now**

- 🏦 **Monobank integration**: syncs accounts and transactions automatically, including history backfill
- 🏷️ **Auto-categorization**: transactions are sorted into categories (groceries, transport, subscriptions, …)
- 🧠 **Merchant rules**: teach the app once how to categorize a merchant, and it remembers
- 🔁 **Transfer detection**: transfers between your own cards are not counted as expenses
- 📊 **Analytics page**: spending by category, income vs. expenses by day, top merchants, comparison with the previous period
- 👨‍👩‍👧 **Family members**: accounts can belong to different family members
- 🌗 **Light / dark theme**

**Coming next**

- 🏦 PrivatBank integration
- 🪙 Crypto transactions tracking
- 🤖 **AI financial assistant** that analyzes spending, finds ways to optimize expenses and gives personal advice

## 🛠 Tech stack

| Part | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite, Recharts |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL, Prisma ORM |
| Integrations | Monobank API |

## 📁 Project structure

```
family_finance/
├── backend/            # Express API + Prisma
│   ├── prisma/         # database schema and migrations
│   ├── src/
│   │   ├── index.ts      # API routes, sync and categorization logic
│   │   ├── monobank.ts   # Monobank API client
│   │   ├── analytics.ts  # analytics reports
│   │   └── prisma.ts     # database client
│   └── .env.example    # environment variables template
└── frontend/           # React app
    └── src/
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
cp .env.example .env      # then fill in your own values
npx prisma migrate dev    # create database tables
npx prisma generate       # generate the Prisma client
npm run dev               # http://localhost:3000
```

**3. Set up the frontend** (in a new terminal)

```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```

## 🔐 Security

- All secrets (database URL, bank tokens, personal categorization rules) live in `.env`, which is **never committed**
- Bank tokens are used **only on the backend**; the frontend never sees them
- `.env.example` shows which variables are needed, without real values

## 👤 Author

**Yura**: junior full stack developer, Košice 🇸🇰
GitHub: [@yuran4ik13](https://github.com/yuran4ik13)
