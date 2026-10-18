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

## How user data is protected

- Every record belongs to one user; every query filters by the logged-in user
- Bank tokens are encrypted with AES-256-GCM, bound to their owner, never returned to the browser
- Passwords: scrypt hashes, 12+ characters, common passwords rejected
- Sessions: httpOnly SameSite cookies, invalidated on password change
- Security log of account events (90 days), data export and full account deletion
- Automated isolation tests run in CI on every push

## Running your own copy safely

- Never commit `.env`; use `.env.example` as a template
- Use a long random `JWT_SECRET` (`openssl rand -base64 48`) and a separate
  `ENCRYPTION_KEY` (`openssl rand -base64 32`). Back up `ENCRYPTION_KEY`:
  without it saved bank tokens can't be decrypted
- Serve the app over **HTTPS** in production and set `NODE_ENV=production`
- Keep `ALLOW_REGISTRATION=false` unless the server is meant for other people
- For a public demo use a **separate database with fake data** (`npm run seed:demo`)
  and a **read-only** demo login; never put real bank tokens on a demo server
- Keep the database private (not reachable from the internet) and take
  encrypted backups
