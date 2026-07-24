#!/usr/bin/env bash
#
# Full database backup via pg_dump.
#
# Produces a single portable .sql.gz dump containing:
#   - all schemas (public, auth, extensions, storage, etc.)
#   - all tables, functions, views, triggers
#   - auth.users (emails, password hashes) for disaster recovery
#
# No table list to maintain — new tables are picked up automatically.
#
# Usage:
#   ./scripts/backup.sh [output-dir]
#
# Requires:
#   SUPABASE_DB_URL — direct Postgres connection string
#     (Session pooler, port 5432,
#      e.g. postgresql://postgres.<ref>:<pass>@aws-0-<region>.pooler.supabase.com:5432/postgres)
#
# Set the URL in GitHub Secrets (SUPABASE_DB_URL) or .env.local.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# --- load .env files if present (does not override already-set vars) ---
for f in "$PROJECT_ROOT/.env" "$PROJECT_ROOT/.env.local"; do
  [ -f "$f" ] || continue
  set -a
  # shellcheck disable=SC1090
  . "$f"
  set +a
done

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required (direct Postgres connection string)}"

# Diagnostic: confirm the var is set and looks like a URL (value is masked by CI)
echo "SUPABASE_DB_URL length: ${#SUPABASE_DB_URL}"
case "$SUPABASE_DB_URL" in
  postgresql://*|postgres://*) : ;;
  *) echo "ERROR: SUPABASE_DB_URL does not start with postgresql:// or postgres://" >&2; exit 1 ;;
esac

# Parse the connection string into PG* env vars.
# pg_dump's conninfo parser sometimes chokes on Supabase pooler usernames
# containing a dot (e.g. postgres.<ref>), so we feed components individually.
URL_NO_SCHEME="${SUPABASE_DB_URL#*://}"
AUTH_HOST_DB="${URL_NO_SCHEME%%\?*}"      # strip query string if present
AUTH_AND_HOST="${AUTH_HOST_DB%%/*}"        # user:pass@host:port
DB_NAME="${AUTH_HOST_DB#*/}"               # part after first slash
[ -z "$DB_NAME" ] && DB_NAME="postgres"

USER_PASS="${AUTH_AND_HOST%@*}"             # user:pass
PGHOST="${AUTH_AND_HOST#*@}"               # host:port

PGUSER="${USER_PASS%%:*}"
PGPASSWORD="${USER_PASS#*:}"

# Handle IPv6 host [::1]:port — strip brackets for PGHOST
if [[ "$PGHOST" == \[* ]]; then
  PGHOST="${PGHOST#[}"
  PGHOST="${PGHOST%%]:*}"
fi

# Split host:port (port optional)
PGPORT="5432"
case "$PGHOST" in
  *:*) PGPORT="${PGHOST##*:}"; PGHOST="${PGHOST%:*}" ;;
esac

export PGUSER PGPASSWORD PGHOST PGPORT
echo "Parsed: host=$PGHOST port=$PGPORT user=$PGUSER db=$DB_NAME"

OUT_DIR="${1:-$PROJECT_ROOT/backups/backup-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
mkdir -p "$OUT_DIR"

DUMP_FILE="$OUT_DIR/db.sql"

echo "Backing up database to $DUMP_FILE.gz ..."

# --no-owner / --no-privileges: portable across projects
# --clean --if-exists: restore script drops existing objects first
# --quote-all-identifiers: safe against reserved words
# --column-inserts: human-readable, row-level restore (slower but robust)
pg_dump --dbname="$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean --if-exists \
  --quote-all-identifiers \
  --column-inserts \
  | gzip > "$DUMP_FILE.gz"

echo "Done: $DUMP_FILE.gz ($(du -h "$DUMP_FILE.gz" | cut -f1))"
echo "Restore with: gunzip -c $DUMP_FILE.gz | psql \$SUPABASE_DB_URL"