# Database backups

Railway gates its own backups and PITR behind the Pro plan ($20/mo vs $5).
This is a cron service that does the same job for free: a daily `pg_dump`
uploaded to Cloudflare R2.

It is deployed as a **separate Railway service** from the same repo, with
its root directory set to `backup`. Nothing here runs as part of the app,
and the app never reads these variables — that's why they aren't in
`.env.example`.

## Setup

**Cloudflare:** create an R2 bucket and an API token scoped to it with
Object Read & Write. Add a lifecycle rule expiring objects after 90 days,
so retention is R2's job rather than the script's.

**Railway:** new service from this repo, then in Settings:

- Root Directory: `backup`
- Cron Schedule: `0 9 * * *`
- No public domain

Variables:

```
DATABASE_URL=${{Postgres-YK7-.DATABASE_URL}}   # reference, stays internal
R2_ACCOUNT_ID=
R2_BUCKET=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
HEALTHCHECK_URL=                               # optional, see below
```

The service shows as stopped/crashed after each run. That's correct — a
cron service is supposed to exit when it's done. Check the logs for the
`uploaded cajita/…` line instead of the service status.

## Restoring

Objects are keyed `cajita/YYYY-MM-DD.sql.gz`, so a rerun on the same day
overwrites rather than piling up.

```bash
gunzip -c cajita-2026-08-01.sql.gz | psql "$DATABASE_URL"
```

The dump is taken with `--no-owner --no-privileges`, so it restores into a
fresh database without needing the original roles to exist.

Note that `pg_dump` must match the server major version (18). The Alpine
image pins this; a Homebrew `psql` on a laptop usually won't match.

## Why the script is fussier than a one-liner

Two failure modes matter more than the happy path:

- **A dump that fails halfway** would otherwise upload a truncated file
  over a good backup. The script checks the gzip is intact and larger than
  10 kB before uploading anything.
- **A cron job that stops running** is silent by default, and you find out
  when you need the backup. Set `HEALTHCHECK_URL` to a healthchecks.io
  ping URL; it's only hit on success, so failure or silence both alert.

## What isn't covered

Only Postgres. Electric's shape state isn't backed up, on the assumption
it rebuilds from the database.
