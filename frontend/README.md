# Family Finance · Website

The web version: dashboard, transactions, analytics, settings.
React 19 + TypeScript + Vite + Recharts. It talks only to the [backend](../backend) API.

## Run it locally

Start the backend first, then in a new terminal:

```bash
cd frontend
npm ci
npm run dev        # http://localhost:5173
```

The API address comes from `VITE_API_URL` in `frontend/.env`
(default `http://localhost:3000`). The backend must list the website address
in its `FRONTEND_ORIGIN`, otherwise CORS blocks the requests.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server with instant reload |
| `npm run lint` | Check the code style and common mistakes |
| `npm run build` | Production build into `dist/` |

## Files

```
frontend/src/
├── main.tsx           # entry point
├── AuthGate.tsx       # shows the login page until the user is signed in
├── LoginPage.tsx      # sign in / sign up
├── App.tsx            # dashboard and transactions
├── AnalyticsPage.tsx  # analytics with charts
├── SettingsPage.tsx   # bank token, markers, password, data
├── api.ts             # every request to the backend (cookies, CSRF header)
└── theme.css          # colours for light and dark theme
```
