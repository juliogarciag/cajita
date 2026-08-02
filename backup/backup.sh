#!/bin/sh
# Daily logical backup of the Cajita database to Cloudflare R2.
# Runs as a Railway cron service; exits as soon as it is done.
set -eu

: "${DATABASE_URL:?missing}"
: "${R2_ACCOUNT_ID:?missing}"
: "${R2_BUCKET:?missing}"
: "${R2_ACCESS_KEY_ID:?missing}"
: "${R2_SECRET_ACCESS_KEY:?missing}"

KEY="cajita/$(date -u +%Y-%m-%d).sql.gz"
TMP=/tmp/dump.sql.gz

pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 >"$TMP"

# A backup that silently uploads an empty file is worse than no backup, so
# check the dump is intact and plausibly sized before it replaces anything.
gzip -t "$TMP"
SIZE=$(wc -c <"$TMP")
if [ "$SIZE" -lt 10000 ]; then
  echo "dump is only ${SIZE} bytes — refusing to upload" >&2
  exit 1
fi

curl --fail --silent --show-error \
  --aws-sigv4 "aws:amz:auto:s3" \
  --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
  --upload-file "$TMP" \
  "https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${KEY}"

echo "uploaded ${KEY} (${SIZE} bytes)"

# Dead man's switch: only pinged on success, so a job that stops running or
# starts failing surfaces as an alert instead of silence.
if [ -n "${HEALTHCHECK_URL:-}" ]; then
  curl --fail --silent --max-time 10 "$HEALTHCHECK_URL" >/dev/null || true
fi
