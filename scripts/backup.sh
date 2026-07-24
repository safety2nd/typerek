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

OUT_DIR="${1:-$PROJECT_ROOT/backups/backup-$(date -u +%Y-%m-%dT%H-%M-%SZ)}"
mkdir -p "$OUT_DIR"

DUMP_FILE="$OUT_DIR/db.sql"

echo "Backing up database to $DUMP_FILE.gz ..."

# --no-owner / --no-privileges: portable across projects
# --clean --if-exists: restore script drops existing objects first
# --quote-all-identifiers: safe against reserved words
# --column-inserts: human-readable, row-level restore (slower but robust)
pg_dump "$SUPABASE_DB_URL" \
  --format=plain \
  --no-owner \
  --no-privileges \
  --clean --if-exists \
  --quote-all-identifiers \
  --column-inserts \
  | gzip > "$DUMP_FILE.gz"

echo "Done: $DUMP_FILE.gz ($(du -h "$DUMP_FILE.gz" | cut -f1))"
echo "Restore with: gunzip -c $DUMP_FILE.gz | psql \$SUPABASE_DB_URL"