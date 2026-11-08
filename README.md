# Ranchi Tenants

Rental management with prepaid electricity. Admins manage **properties → units → leases** and track
**rent**; tenants pay rent and buy **kWh** with **Paystack**, and on a verified payment the server vends a
**StronPower STS PIN** for meters on units they currently lease.

## Rentals

- **Property** (building / estate) belongs to a **company**, whose StronPower account vends its meters.
  A **unit** (flat, shop) belongs to a property; each **meter** is placed in a unit of the same company.
- **Lease** = tenant + unit + start/end date (blank end = rolling) + rent per period (monthly, quarterly,
  6-monthly, yearly). A tenant can hold several. Occupancy is derived, never stored: a unit is
  *occupied* with an active lease, *lease expired* if the last lease ran out with no renewal or
  move-out, otherwise *vacant*. Dates are calendar days in Lagos time.
- **Vending is tied to the lease**: a tenant can top up a meter only while their lease on its unit is
  active. An expired lease no longer blocks login (they may need to pay rent); a manual pause does.
- **Rent**: one charge per lease period, due on its first day, created a month ahead
  (`syncRentCharges` in `lib/rent.ts`; a part period at the end is pro-rated by days). Tenants pay a
  charge's balance on their dashboard via Paystack (same service fee rule as electricity, references
  start `rnt_`); admins record cash/transfers, including part payments, on **Admin → Rent**.
- Renew from **Admin → Leases** (creates a linked lease from the day after the old one ends); **End /
  move out** sets the last day of occupancy.

## Stack

- Next.js 15 App Router + TypeScript + Tailwind CSS
- Prisma + PostgreSQL 16
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
docker compose -f docker-compose.dev.yml up -d   # Postgres on localhost:5433 (ranchi/ranchi)
npx prisma migrate deploy
npm run db:seed
npm run dev
```

After changing `prisma/schema.prisma`, create a migration with `npx prisma migrate dev --name <change>`.

Open http://localhost:3000

## Docker

```bash
cp .env.docker.example .env.docker   # fill in APP_URL, SESSION_SECRET, ADMIN_*, Paystack keys
docker compose up -d --build
docker compose logs -f app
```

- The image builds a Next.js **standalone** server and runs it as the non-root `node` user.
- On every start the entrypoint runs `prisma migrate deploy`, then creates the first admin from
  `ADMIN_EMAIL` / `ADMIN_PASSWORD` **only if no admin exists** (remove `ADMIN_PASSWORD` afterwards).
  The demo seed (`password123` accounts) is never run in Docker.
- Postgres runs in the `db` service with data on the `pg-data` volume. Set `POSTGRES_*` and the
  matching `DATABASE_URL` in `.env.docker`.
- **Backups:** the `backup` service writes a daily `pg_dump` to `./backups` (7 daily, 4 weekly,
  6 monthly); the files are owned by root. Copy that folder off the server regularly. Take one now with
  `docker compose exec backup /backup.sh`. Restore with
  `gunzip -c backups/last/ranchi-latest.sql.gz | docker compose exec -T db psql -U ranchi -d <empty db>`.
- Login cookies are `Secure` when `APP_URL` is `https://`; with an `http://` APP_URL (local/LAN
  testing) they aren't, so login still works. Put the container behind HTTPS in production.
- Change the host port with `HOST_PORT=8080 docker compose up -d`.

### Upgrading a SQLite deployment (one-off)

Versions before Postgres kept everything in `/app/data/ranchi.db` on the `ranchi-data` volume. The
image carries everything needed to move it; the server only needs the image, `docker-compose.yml`
and `.env.docker`. Work in the **same folder you deployed from**, so Docker reuses the same volume.

```bash
# 0. Build and ship the new image as usual, e.g. locally:
#      docker build -t ranchi-tenants:1.7 . && docker save ranchi-tenants:1.7 | gzip > ranchi-1.7.tar.gz
#    and on the server:  gunzip -c ranchi-1.7.tar.gz | docker load

# 1. Stop the app and keep a spare copy of the database. Paystack retries webhooks, and the
#    dashboard re-checks payments when tenants return, so nothing is lost while it's down.
docker compose stop app
docker compose cp app:/app/data/ranchi.db ./ranchi-backup-$(date +%F).db

# 2. Replace docker-compose.yml with the new one, and add to .env.docker (see .env.docker.example):
#      POSTGRES_USER=ranchi
#      POSTGRES_PASSWORD=<openssl rand -hex 24>
#      POSTGRES_DB=ranchi
#      DATABASE_URL=postgresql://ranchi:<same password>@db:5432/ranchi
#    and pick the image tag:
echo "APP_VERSION=1.7" > .env

# 3. Start Postgres only, then move the data. This updates a copy of the SQLite file, creates the
#    tables, copies everything and checks row counts and money totals. It refuses a non-empty
#    database.
docker compose up -d db
docker compose run --rm --entrypoint /app/docker/migrate-from-sqlite.sh app

# 4. Only if step 3 ended with "✓ All row counts and totals match":
docker compose up -d
```

Smoke-test: log in as admin (passwords are unchanged), open Leases, Rent and Purchases, log in as
a tenant, and make a small top-up.

- Don't start the app before step 3: startup creates an admin and the settings row, and the copy
  only goes into an empty database. If step 3 fails partway, nothing is committed; fix the cause
  and run it again.
- **Roll back:** `docker compose down`, restore the old `docker-compose.yml`, and start the
  previous image. The SQLite file is untouched (the new app mounts it read-only).
- Once you're happy (say a week later), remove the `ranchi-data` line under `app` in
  `docker-compose.yml`.

### Seed accounts

| Role   | Email                 | Password     |
|--------|-----------------------|--------------|
| Admin  | admin@ranchi.local    | password123  |
| Tenant | tenant@ranchi.local   | password123  |

Seed: property *Demo Court*, unit *Flat A1* with meter `04161234567`, leased to the tenant for a year.

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

- Each company has a **price per kWh** (`Company.nairaPerKwh`), set on **/admin/companies**.
- Tenants enter a **naira** amount. The app converts it to whole **0.1 kWh** steps (rounded down) at
  the company price and charges exactly `kWh × price` plus a **service fee**.
- Only the **kWh** is sent to StronPower to generate the token; StronPower's own tariff is not read.
  StronPower's sales reports will show its own naira value for each vend; the app's purchase records
  are the source of truth for money.
- The service fee is set on **/admin/settings** (percent, flat, cap). Enter Paystack's rate: the fee is
  grossed up so that after Paystack's charge on the total you still receive the full electricity amount.
- Before the final vend, StronPower's preview must be for exactly the kWh paid for; otherwise the
  purchase is marked FAILED instead of vending.

## Failed / stuck purchases

**/admin/purchases** lists recent purchases:
- **Verify payment** (PENDING): asks Paystack; if paid, vends.
- **Retry vend** (FAILED, paid): re-runs the StronPower vend. If the failure happened after the final
  `GenStoreVendingData` request was sent, a token may already exist, so the admin must first confirm
  they checked StronPower's vending records.

## Notifications (email & SMS)

Configured on **/admin/settings → Notifications** (stored in the `Settings` row; SMTP password and SMS
API key are never sent back to the browser — leave blank to keep the saved value).

- **Welcome:** when an admin creates a tenant, they get the login URL (`APP_URL/login`), their email
  and a temporary password. Leave the password blank to generate one; the tenant must choose a new
  password at first login. The admin also sees the password once, plus whether the welcome went out.
- **Password reset:** when an admin resets a tenant's password, the new temporary password is sent the
  same way (login URL, email, temporary password). Each of these can be switched off on the settings page.
- **Events:** token generated → tenant (token, meter, kWh, reference); paid but vend failed → tenant
  ("token delayed", once per purchase) and admin alert emails/phones (every failure, incl. retries).
- **Email:** any SMTP server (host, port, STARTTLS/SSL, username, password, from address/name).
- **SMS gateways:** Termii, Africa's Talking, Twilio, or a **custom HTTP gateway** (URL / body / header
  templates with `{to}`, `{to_e164}`, `{message}`, `{sender}`, `{apiKey}`, `{username}`).
- Tenants receive SMS at the **phone** on their tenant record (admin Tenants page or at registration).
  Local numbers starting with `0` get the configured country code (default 234).
- "Send test" buttons use the saved settings. Every attempt is logged (`NotificationLog`, without the
  message body) and the last 25 are shown on the settings page.
- Sending happens after the purchase is saved and never blocks or fails the Paystack webhook.

## Paystack

- `POST /api/paystack/initialize` — creates `Purchase` (PENDING), starts Paystack (or mock when dry-run)
- `POST /api/paystack/webhook` — verifies `x-paystack-signature`, marks PAID, calls `fulfillPurchase`
- Local dry-run uses `POST /api/paystack/mock-complete` after initialize

Configure webhook URL in Paystack dashboard: `{APP_URL}/api/paystack/webhook`.

## Project layout

```
prisma/schema.prisma   User, Company, Property, Unit, Lease, RentCharge, RentPayment, Meter, Purchase, Settings, NotificationLog
prisma/seed.ts
src/lib/stronpower.ts  Cookie jar + login + vend + parsers
src/lib/vend.ts        Post-payment STS fulfillment
src/lib/leases.ts      Lease dates, states, occupancy (pure)
src/lib/rent.ts        Rent schedule, charge sync, rent payment confirmation
src/lib/tenancy.ts     Which meters a tenant may top up
src/lib/paystack.ts
src/lib/notify/       Email (nodemailer) + SMS gateways + message templates
src/lib/session.ts     iron-session
src/app/...            UI + API routes
```

## Production notes

- Set a strong `SESSION_SECRET` (≥32 chars)
- Set real `PAYSTACK_SECRET_KEY` and `PAYSTACK_DRY_RUN=false`
- Set `STRON_DRY_RUN=false` only when live StronPower credentials are configured per company
- Copy `./backups` off the server (another machine or cloud storage); a backup on the same disk
  doesn't survive losing that disk
