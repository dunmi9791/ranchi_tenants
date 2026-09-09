# Ranchi Tenants

Prepaid meter top-up for multi-company tenants. Tenants buy **kWh**, pay with **Paystack**, and on a verified webhook the server vends a **StronPower STS PIN**.

## Stack

- Next.js 15 App Router + TypeScript + Tailwind CSS
- Prisma + SQLite
- iron-session + bcrypt credentials auth
- Paystack initialize + webhook (HMAC signature)
- StronPower server-only client (`lib/stronpower.ts`)

## Hard rules

- StronPower credentials (`stronPassword`, etc.) **never** go to the browser.
- `amount` passed to StronPower is **kWh**; NGN = `kWh × company.nairaPerKwh`.
- `STRON_DRY_RUN=true` skips live `GenStoreVendingData` and returns a deterministic dry-run PIN.

## Quick start

```bash
cp .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Seed accounts

| Role   | Email                 | Password     |
|--------|-----------------------|--------------|
| Admin  | admin@ranchi.local    | password123  |
| Tenant | tenant@ranchi.local   | password123  |

Seed meter: `04161234567` (linked to tenant).

## Scripts

| Script            | Description                |
|-------------------|----------------------------|
| `npm run dev`     | Next.js dev server         |
| `npm run build`   | Production build           |
| `npm start`       | Run production server      |
| `npm test`        | Vitest (StronPower parsers)|
| `npm run db:push` | `prisma db push`           |
| `npm run db:seed` | Seed admin/tenant/company  |
| `npm run lint`    | ESLint                     |

## StronPower flow (server)

1. `GET {base}/` → parse `__RequestVerificationToken`
2. `POST {base}/` with `Companyname`, `Username`, `Password`, token (cookie jar)
3. `POST {base}/en/Account/GenStepVendingUnitInfo` (preview)
4. `POST {base}/en/Account/GenStoreVendingData` (live vend; skipped if `STRON_DRY_RUN=true`)
5. PIN = first `^^` (or comma) segment that looks like an STS token

Each **Company** row stores its own `stronBaseUrl` + credentials.

## Paystack

- `POST /api/paystack/initialize` — creates `Purchase` (PENDING), starts Paystack (or mock when dry-run)
- `POST /api/paystack/webhook` — verifies `x-paystack-signature`, marks PAID, calls `fulfillPurchase`
- Local dry-run uses `POST /api/paystack/mock-complete` after initialize

Configure webhook URL in Paystack dashboard: `{APP_URL}/api/paystack/webhook`.

## Project layout

```
prisma/schema.prisma   User, Company, Meter, Purchase
prisma/seed.ts
src/lib/stronpower.ts  Cookie jar + login + vend + parsers
src/lib/vend.ts        Post-payment STS fulfillment
src/lib/paystack.ts
src/lib/session.ts     iron-session
src/app/...            UI + API routes
```

## Production notes

- Set a strong `SESSION_SECRET` (≥32 chars)
- Set real `PAYSTACK_SECRET_KEY` and `PAYSTACK_DRY_RUN=false`
- Set `STRON_DRY_RUN=false` only when live StronPower credentials are configured per company
- Prefer hosting SQLite on persistent volume or switch datasource to Postgres
