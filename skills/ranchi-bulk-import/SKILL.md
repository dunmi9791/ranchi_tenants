---
name: ranchi-bulk-import
description: Bulk-import tenants and prepaid meters into the Ranchi Tenants app from an Excel file - creates tenant accounts, creates meters, links each meter to its company and assigns it to its tenant. Use when the user shares a tenant/meter spreadsheet (.xlsx) and wants it loaded into Ranchi Tenants, or asks to bulk create/link tenants, meters or companies there.
---

# Ranchi Tenants bulk import

Loads a spreadsheet of tenants and meters into the Ranchi Tenants web app through its admin API,
using `scripts/import_tenants.py`. The script always validates the whole file against the live
app first, and changes nothing unless every row is valid and `--apply` is passed.

## What you need from the user

1. **The Excel file**: one row per meter. `assets/tenant_import_template.xlsx` is the template to
   give them if they don't have one.
2. **App URL**: e.g. `https://tenants.example.com`. It must be reachable from where you run the
   script. A `localhost` URL on the user's own machine usually isn't reachable from your sandbox,
   so ask for the public / LAN URL.
3. **An admin email and password.** Pass them through environment variables, not on the command
   line, and never write them into a file or repeat the password back to the user.

## Spreadsheet columns

Headers are matched case-insensitively. `*` and anything in brackets are ignored, so the template's
`Tenant Name *` and `Check (auto)` headers work as they are.

| Column | Required | Notes |
|---|---|---|
| Tenant Name | for new tenants | at least 2 characters |
| Email | to link a tenant | tenant's login. The same email on several rows means one tenant with several meters, and name/password must match on every row |
| Temporary Password | no | 6+ characters. If blank, the app generates one and the report shows it once. The tenant must change it at first login |
| Phone | no | used for SMS notifications |
| Lease Expiry Date | no | Excel date or `YYYY-MM-DD` / `DD/MM/YYYY` |
| Lease Notes | no | |
| Meter Number | **yes** | 5+ characters, unique |
| Meter Label | no | e.g. "Flat 3B" |
| Company | **yes** | must match the name of a company that **already exists** in the app (case-insensitive) |

A row with only Meter Number and Company creates an unassigned meter.

**Companies are not created by this skill.** A company needs StronPower credentials. If a company
is missing, tell the user to add it under Admin → Companies first, then rerun.

## How it behaves with existing data

- **Tenant email already in the app**: the tenant is reused, not changed. The meter is just linked to them.
- **Meter number already in the app**:
  - If it's already linked as requested, the row reports `OK` and nothing changes.
  - If it's unassigned, or only the label differs, it gets updated.
  - If it belongs to a **different tenant or company**, that row is an error unless you pass
    `--allow-reassign`. Only use that flag after the user confirms the move.
- Linking a meter to a tenant also sets the tenant's company to the meter's company. This is how the app works.
- When the app creates a tenant, it sends the welcome email/SMS with their temporary password,
  if notifications are enabled under Admin → Settings. The report says whether each one went out.
- Reruns are safe. Rows that were already imported come back as `OK`/no-op.

## Workflow

Install the dependency if needed: `pip install openpyxl`.

1. **Dry run** (always do this first):
   ```bash
   RANCHI_URL='https://…' RANCHI_ADMIN_EMAIL='…' RANCHI_ADMIN_PASSWORD='…' \
     python scripts/import_tenants.py /path/to/tenants.xlsx
   ```
   It prints a plan (tenants to create, meters to create/update, rows already correct, errors and
   warnings) and writes `<file>_import_report.xlsx` with a Status/Detail column per row.
2. **If there are errors**, show the user each failing row and its reason in plain language, then
   help them fix the sheet. You may correct obvious typos yourself, such as a company name that
   differs only in spacing, but tell them what you changed. Then dry-run again. Exit code 1 means
   there were validation errors and nothing was written.
3. **Show the plan and get the user's explicit go-ahead.** Mention the counts, any reassignments,
   and that welcome messages will go out to new tenants.
4. **Apply** with the same command plus `--apply`, and add `--allow-reassign` only if the user
   approved the moves. Exit code 2 means some rows failed at the server. The report lists them.
   Fix those rows and rerun, since successful rows will no-op.
5. **Hand back the report file.** Tell the user it may contain generated passwords and should be
   shared carefully. Supplied passwords are masked as `***`.

## Options

| Flag | Meaning |
|---|---|
| `--apply` | make the changes (default is dry run) |
| `--allow-reassign` | allow moving existing meters to another tenant/company |
| `--sheet NAME` | sheet to read (default `Tenants`, else the first sheet) |
| `--report PATH` | where to write the report |
| `--url/--email/--password` | instead of the `RANCHI_*` env vars |

## Watch out for

- Excel can turn long meter numbers into numbers and drop leading zeros. The script warns when a
  meter cell is numeric and shorter than 11 digits. Check these numbers with the user before
  applying.
- Login failures (401) mean a wrong admin email or password. A "not an ADMIN" error means the
  account is a tenant.
- An "Email already exists" failure on tenant create means that email belongs to an admin
  account, not a tenant.
