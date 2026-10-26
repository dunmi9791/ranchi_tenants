/**
 * One-off copy of the old SQLite database into an empty, migrated Postgres database.
 * In Docker, docker/migrate-from-sqlite.sh does all the steps; locally:
 *
 *   DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB node docker/sqlite-to-postgres.mjs path/to/ranchi.db
 *
 * - The SQLite file must have every SQLite migration applied:
 *     DATABASE_URL=file:/abs/path/ranchi.db npx prisma migrate deploy --schema prisma/sqlite/schema.prisma
 * - Postgres must be migrated (`npx prisma migrate deploy`) and empty: don't start the app against
 *   it first, because startup creates an admin and settings.
 * - Everything is copied in one transaction; IDs are kept. Afterwards row counts and money totals
 *   are compared and the script exits non-zero on any mismatch.
 */
import Database from "better-sqlite3";
import { Prisma, PrismaClient } from "@prisma/client";

const LAST_SQLITE_MIGRATION = "20261015090000_properties_units_leases";

/** Foreign-key order. Lease.renewedFromId points at another lease, so it's filled in afterwards. */
const ORDER = [
  "Company",
  "User",
  "Property",
  "Unit",
  "Meter",
  "Lease",
  "RentCharge",
  "RentPayment",
  "Purchase",
  "Settings",
  "NotificationLog",
];

const CHUNK = 500;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** Prisma on SQLite stores DateTime as epoch ms; SQL defaults (CURRENT_TIMESTAMP) give "YYYY-MM-DD HH:MM:SS" UTC. */
function toDate(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "bigint") return new Date(Number(v));
  if (typeof v === "string") {
    const d = new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(v) ? `${v.replace(" ", "T")}Z` : v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  fail(`Unreadable date value: ${String(v)}`);
}

function convert(model, row) {
  const out = {};
  for (const f of model.fields) {
    if (f.kind === "object" || !(f.name in row)) continue;
    const v = row[f.name];
    if (v === null) out[f.name] = null;
    else if (f.type === "DateTime") out[f.name] = toDate(v);
    else if (f.type === "Boolean") out[f.name] = v === 1 || v === true || v === "1";
    else if (f.type === "Int") out[f.name] = Number(v);
    else out[f.name] = v;
  }
  return out;
}

const delegate = (client, model) => client[model[0].toLowerCase() + model.slice(1)];

async function main() {
  const file = process.argv[2];
  if (!file) fail("Usage: node docker/sqlite-to-postgres.mjs path/to/ranchi.db");
  if (!process.env.DATABASE_URL?.startsWith("postgres")) fail("DATABASE_URL must point at the Postgres database");

  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  const pg = new PrismaClient();
  const models = Prisma.dmmf.datamodel.models;

  // Every model must be in ORDER, so a model added later can't be silently skipped.
  const missing = models.map((m) => m.name).filter((n) => !ORDER.includes(n));
  if (missing.length) fail(`Add these models to ORDER first: ${missing.join(", ")}`);

  const applied = sqlite
    .prepare("SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL")
    .get(LAST_SQLITE_MIGRATION);
  if (!applied) {
    fail(
      `${file} hasn't applied ${LAST_SQLITE_MIGRATION}. Run first:\n` +
        `  DATABASE_URL=file:<absolute path> prisma migrate deploy --schema prisma/sqlite/schema.prisma`
    );
  }

  for (const name of ORDER) {
    const n = await delegate(pg, name).count();
    if (n > 0) fail(`Postgres table ${name} already has ${n} rows. The target must be empty.`);
  }

  const rows = Object.fromEntries(
    ORDER.map((name) => {
      const model = models.find((m) => m.name === name);
      return [name, sqlite.prepare(`SELECT * FROM "${name}"`).all().map((r) => convert(model, r))];
    })
  );

  console.log(`Copying ${file} → Postgres`);
  await pg.$transaction(
    async (tx) => {
      for (const name of ORDER) {
        const data = name === "Lease" ? rows.Lease.map((l) => ({ ...l, renewedFromId: null })) : rows[name];
        for (let i = 0; i < data.length; i += CHUNK) {
          await delegate(tx, name).createMany({ data: data.slice(i, i + CHUNK) });
        }
        console.log(`  ${name.padEnd(16)} ${data.length}`);
      }
      for (const l of rows.Lease.filter((l) => l.renewedFromId)) {
        await tx.lease.update({ where: { id: l.id }, data: { renewedFromId: l.renewedFromId } });
      }
    },
    { timeout: 10 * 60 * 1000, maxWait: 60 * 1000 }
  );

  // ---- verify ----
  const problems = [];
  for (const name of ORDER) {
    const n = await delegate(pg, name).count();
    if (n !== rows[name].length) problems.push(`${name}: SQLite ${rows[name].length}, Postgres ${n}`);
  }
  const sq = (sql) => Number(sqlite.prepare(sql).get().v ?? 0);
  const close = (a, b) => Math.abs(a - b) < 0.005;

  const sqPurchases = sq(`SELECT SUM("nairaAmount" + "serviceFee") v FROM "Purchase" WHERE "status" IN ('PAID','VENDED')`);
  const pgPurchases = await pg.purchase.aggregate({
    _sum: { nairaAmount: true, serviceFee: true },
    where: { status: { in: ["PAID", "VENDED"] } },
  });
  const pgPurchaseTotal = (pgPurchases._sum.nairaAmount ?? 0) + (pgPurchases._sum.serviceFee ?? 0);
  if (!close(sqPurchases, pgPurchaseTotal)) problems.push(`Paid purchases: SQLite ₦${sqPurchases}, Postgres ₦${pgPurchaseTotal}`);

  const sqRent = sq(`SELECT SUM("amount") v FROM "RentPayment" WHERE "status" = 'PAID'`);
  const pgRent = (await pg.rentPayment.aggregate({ _sum: { amount: true }, where: { status: "PAID" } }))._sum.amount ?? 0;
  if (!close(sqRent, pgRent)) problems.push(`Rent paid: SQLite ₦${sqRent}, Postgres ₦${pgRent}`);

  const sqLatest = toDate(sq(`SELECT MAX("createdAt") v FROM "Purchase"`) || null);
  const pgLatest = (await pg.purchase.aggregate({ _max: { createdAt: true } }))._max.createdAt;
  if ((sqLatest?.getTime() ?? null) !== (pgLatest?.getTime() ?? null)) {
    problems.push(`Latest purchase: SQLite ${sqLatest?.toISOString()}, Postgres ${pgLatest?.toISOString()}`);
  }

  console.log(`\nPaid purchases ₦${pgPurchaseTotal.toLocaleString()} · rent paid ₦${pgRent.toLocaleString()} · latest purchase ${pgLatest?.toISOString() ?? "none"}`);
  await pg.$disconnect();
  sqlite.close();
  if (problems.length) fail(`Verification failed:\n  ${problems.join("\n  ")}`);
  console.log("✓ All row counts and totals match.");
}

main().catch((err) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
