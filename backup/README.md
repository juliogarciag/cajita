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
Object Read & Write. Then add **one** lifecycle rule, scoped to the
`daily/` prefix, expiring objects after 35 days. See Retention below — the
prefix scope is load-bearing.

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

## Retention

Objects are named in `America/Lima` (set as `TZ` in the Dockerfile), so a
backup's date is the date it was for you, not in UTC. Note that Railway
reads the **cron schedule in UTC** regardless — `0 9 * * *` is 4am here.

Every run uploads the same dump under two keys:

```
daily/2026-08-02.sql.gz     expire after 35 days
weekly/2026-W31.sql.gz      keep forever
```

Daily granularity is what you want for undoing a recent mistake; a year
out, only "roughly then" matters. So the dailies expire and the weeklies
accumulate — 52 objects a year, about 4 MB, against a 10 GB free tier.

The weekly key is written on *every* run rather than once a week. Because
it's keyed by ISO week, each day overwrites it until the week rolls over,
leaving that week's last successful backup. This means a missed or failed
day costs nothing, where a "only upload on Sundays" rule would lose that
week's archive permanently if Sunday happened to fail.

Nothing in the script deletes anything — expiry is entirely R2's job.
That's deliberate: pruning logic is how you lose backups you meant to
keep. **The lifecycle rule must be scoped to the `daily/` prefix.** An
unscoped rule will quietly eat the weekly archive too, and you won't find
out until you go looking for a backup from two years ago.

## Restoring

Both tiers hold identical dumps; pick whichever date you want.

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
