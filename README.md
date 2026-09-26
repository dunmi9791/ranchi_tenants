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
   — success = redirect + `.ASPXAUTH` cookie
3. `POST {base}/en/Account/GetStepVending` (`searchKey` = meter) → customer, tariff category, price
4. `POST {base}/en/Account/GenStepVendingUnitInfo` (preview; ~46 `^^` fields)
5. `POST {base}/en/Account/GenStoreVendingData` (live vend, built from the preview; skipped if `STRON_DRY_RUN=true`)
6. PIN = the 20-digit STS token in the `token^^date` response

This mirrors the sidebar **Unit** dialog of StronPower's web UI (the grid's "Vend by Unit" button
sends `amount=NaN` on accounts without a VAT rate). All steps run in one session because
StronPower expires idle sessions quickly.

Each **Company** row stores its own `stronBaseUrl` + credentials.

## Pricing & service fee

- Tenants enter a **naira** amount. The app reads the meter's live tariff from StronPower
  (`GetStepVending` → `PRICE` + `VAT`), sells whole **0.1 kWh** steps (rounded down), and charges
  exactly `kWh × unit price` — the same figure StronPower records — plus a **service fee**.
- The service fee is set on **/admin/settings** (percent, flat, cap). Enter Paystack's rate: the fee is
  grossed up so that after Paystack's charge on the total you still receive the full electricity amount.
- Before the final vend, the preview total from StronPower must equal what the tenant paid for energy;
  if StronPower's price changed in between, the purchase is marked FAILED instead of vending.
- `Company.nairaPerKwh` is only used as the price when `STRON_DRY_RUN=true`.

## Failed / stuck purchases

**/admin/purchases** lists recent purchases:
- **Verify payment** (PENDING): asks Paystack; if paid, vends.
- **Retry vend** (FAILED, paid): re-runs the StronPower vend. If the failure happened after the final
  `GenStoreVendingData` request was sent, a token may already exist, so the admin must first confirm
  they checked StronPower's vending records.

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
