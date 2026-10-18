# Security Policy

family_finance works with personal financial data, so security issues are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report it privately through GitHub:
**Security → Report a vulnerability** on this repository
(or contact [@yuran4ik13](https://github.com/yuran4ik13) directly).

Please include:

- what the problem is and where (file / endpoint)
- steps to reproduce
- what an attacker could do with it

You'll get a reply within a few days.

## Supported versions

Only the latest version on the `master` branch is supported.

## Running your own copy safely

- Never commit `.env`; use `.env.example` as a template
- Use a long random `JWT_SECRET` (`openssl rand -base64 48`)
- Serve the app over **HTTPS** in production and set `NODE_ENV=production`
- For a public demo use a **separate database with fake data** (`npm run seed:demo`)
  and a **read-only** demo login; never put real bank tokens on a demo server
