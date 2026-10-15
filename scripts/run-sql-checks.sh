#!/usr/bin/env bash
# Applies the migrations (optional) and runs every SQL check file against a PostgreSQL/Supabase database.
# WARNING: use a DEDICATED TEST project (a free Supabase project is fine), never your production database.
#   Migrations: DATABASE_URL="postgresql://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres" ./scripts/run-sql-checks.sh --migrate
#   Checks only: DATABASE_URL=... ./scripts/run-sql-checks.sh
# Each check file runs inside a transaction that is rolled back, so it leaves no data behind.
set -uo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to a TEST database connection string}"
command -v psql >/dev/null || { echo "psql is required (install the PostgreSQL client)"; exit 2; }
cd "$(dirname "$0")/.."
fail=0
if [[ "${1:-}" == "--migrate" ]]; then
  for f in $(ls supabase/migrations/*.sql | sort); do
    echo "== migrate $f"; psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" || { echo "MIGRATION FAILED: $f"; exit 1; }
  done
fi
for f in supabase/tests/rls_checks.sql supabase/tests/phase5_checks.sql supabase/tests/phase6_checks.sql supabase/tests/phase7_checks.sql supabase/tests/phase8_checks.sql supabase/tests/phase9_checks.sql supabase/tests/phase10_checks.sql supabase/tests/phase11_checks.sql supabase/tests/phase13_checks.sql; do
  echo "== $f"
  out=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" 2>&1); code=$?
  echo "$out" | grep -E "PASS|ERROR|assert|CONTEXT|DETAIL" || true
  if [[ $code -ne 0 ]]; then echo "FAILED: $f"; fail=1; fi
done
[[ $fail -eq 0 ]] && echo "ALL SQL CHECKS PASSED" || { echo "SOME SQL CHECKS FAILED (see above)"; exit 1; }
