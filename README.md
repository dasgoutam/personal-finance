# Personal Finance

A self-hosted, single-user personal finance dashboard built with SvelteKit, SQLite, and proper double-entry bookkeeping.

## Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit 2 + TypeScript |
| Styling | Tailwind CSS |
| Runtime adapter | `@sveltejs/adapter-node` |
| Database | SQLite via `better-sqlite3` |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Auth | Lucia v3 (session-based, single user) |
| Password hashing | Argon2id via `@node-rs/argon2` |
| Deployment | Docker Compose on Raspberry Pi (linux/arm64) |

## Schema overview

```
accounts          — chart of accounts (hierarchical via parent_id)
  type: asset | liability | equity | income | expense
  currency: ISO 4217 (EUR, INR, …)

transactions      — a dated, described business event
journal_entries   — individual debit/credit legs of a transaction
  ∑ amount per currency must equal 0  ← double-entry constraint

commodities       — tradeable instruments (ETFs, stocks, mutual funds)
prices            — historical price series per commodity
```

Amounts are stored as **integers in the smallest currency unit** (euro-cents for EUR, paise for INR). This avoids floating-point rounding issues.

Commodity quantities use **milli-units** (1 000 = 1 share/unit).

## Local development

### Prerequisites

- Node 20+
- `npm`

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env
# Edit .env to set your username/password

# 3. Generate & apply migrations
npm run db:generate   # creates drizzle/migrations/ SQL files (already included)
npm run db:migrate    # applies migrations to ./data/finance.db

# 4. Seed with sample data (Germany/India dual-currency accounts)
npm run db:seed

# 5. Start dev server
npm run dev
```

Open http://localhost:5173 and log in with the credentials you set in `.env`
(defaults: `admin` / `changeme`).

### Available npm scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Build production bundle |
| `npm run preview` | Preview production build locally |
| `npm run check` | Run `svelte-check` type checker |
| `npm run db:generate` | Generate SQL migrations from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema directly to DB (dev shortcut, no migration files) |
| `npm run db:seed` | Seed the database with sample accounts and transactions |
| `npm run db:studio` | Open Drizzle Studio (web UI for the database) |

## Double-entry constraint

The constraint is enforced at the application layer in `src/lib/server/finance.ts`.
`createTransaction()` rejects any transaction where the sum of `amount` values,
grouped by `currency`, is not exactly zero.

```
EUR legs: +400 000 (salary credit to bank)  +  -400 000 (income debit)  = 0 ✓
INR legs: +500 000 (ETF purchase debit)     +  -500 000 (NRE debit)     = 0 ✓
```

For multi-currency transactions (e.g. wire transfers where you send EUR and
receive INR) each currency group must independently sum to zero — you model the
exchange as two matching legs per currency.

## Seed data highlights

The seed script (`scripts/seed.ts`) creates accounts for a person living in
Germany with EUR as primary currency and INR for Indian investments:

**Assets (EUR):** DKB Girokonto · DKB Tagesgeld · Bargeld
**Assets (INR):** Zerodha Portfolio · PPF Account · NRE Savings Account
**Liabilities:** Visa Kreditkarte
**Income:** Gehalt · Freiberufliche Einnahmen · Dividenden · Investment Returns (INR)
**Expenses:** Miete · Strom & Internet · Lebensmittel · Restaurant · ÖPNV ·
Gesundheit · Freizeit · Kleidung · Transfergebühren

**Commodities:** NIFTYBEES · HDFC Flexi Cap Fund · INFY (Infosys)

**Transactions:** ~25 sample transactions spanning Jan 2024 – Mar 2025,
including salary, rent, groceries, PPF deposit, ETF purchases (with commodity
tracking), remittance via Wise, and PPF interest credit.

## Raspberry Pi deployment

### Build and run with Docker Compose

```bash
# On the Pi (or cross-compile from x86 with Docker buildx):
docker compose up -d --build
```

The SQLite database is stored in a named Docker volume (`finance_data`) so it
survives container rebuilds.

### Seed inside the container

```bash
# First run only — migrate + seed
docker compose exec finance node -e "
  const { execSync } = require('child_process');
  execSync('npm run db:migrate', { stdio: 'inherit' });
"
# Then seed (run the seed script directly with tsx)
docker compose run --rm finance sh -c "npm run db:seed"
```

Or copy a pre-seeded database file into the volume:

```bash
docker cp ./data/finance.db \
  $(docker compose ps -q finance):/data/finance.db
```

### Reverse proxy (nginx example)

```nginx
server {
    listen 80;
    server_name finance.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `./data/finance.db` | Absolute path to the SQLite file |
| `FINANCE_USERNAME` | `admin` | Username created by `db:seed` |
| `FINANCE_PASSWORD` | `changeme` | Password created by `db:seed` |
| `NODE_ENV` | `development` | Set to `production` in Docker |
| `PORT` | `3000` | HTTP port the server listens on |
| `HOST` | `0.0.0.0` | Bind address |

## Project structure

```
src/
  app.css                     Tailwind entry point
  app.d.ts                    App.Locals type augmentation for Lucia
  hooks.server.ts             Session validation on every request
  lib/
    server/
      auth.ts                 Lucia instance + type registration
      finance.ts              createTransaction() with double-entry guard
      db/
        index.ts              better-sqlite3 + Drizzle setup
        schema.ts             All table definitions + inferred types
  routes/
    +layout.server.ts         Pass user to all pages
    +layout.svelte            Nav bar
    +page.server.ts           Root redirect (→ /dashboard or /login)
    login/                    Login form
    logout/                   POST action to invalidate session
    dashboard/                Recent transactions + account balances
scripts/
  migrate.ts                  Standalone migration runner
  seed.ts                     Sample data seeder
drizzle/
  migrations/                 SQL migration files (generated by drizzle-kit)
Dockerfile                    Multi-stage ARM64 image
docker-compose.yml            Pi deployment
```
