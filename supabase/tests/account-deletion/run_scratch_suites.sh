#!/usr/bin/env bash
# Fióktörlési + létszámkorlát scratch-tesztcsomagok futtatása a scratch_suites.txt
# alapján. KIZÁRÓLAG helyi, eldobható Postgres-szerveren.
#
# Használat (a repó gyökeréből):
#   SCRATCH_PGHOST=/tmp SCRATCH_PGPORT=5432 SCRATCH_PGUSER=postgres \
#     bash supabase/tests/account-deletion/run_scratch_suites.sh [suite ...]
# Követelmény: psql és createdb/dropdb (PostgreSQL 15+ kliens). Minden suite egy
# frissen létrehozott "vc_scratch_<suite>" adatbázisban fut, a végén törlődik.
set -euo pipefail
cd "$(dirname "$0")/../../.."
MANIFEST=supabase/tests/account-deletion/scratch_suites.txt
HOST="${SCRATCH_PGHOST:?SCRATCH_PGHOST kötelező (unix socket könyvtár vagy localhost)}"
case "$HOST" in
  /*|localhost|127.0.0.1|::1) ;;
  *) echo "Elutasítva: csak helyi Postgres engedélyezett (kapott: $HOST)" >&2; exit 2 ;;
esac
export PGHOST="$HOST" PGPORT="${SCRATCH_PGPORT:-5432}" PGUSER="${SCRATCH_PGUSER:-postgres}"
unset PGDATABASE DATABASE_URL

declare -A DEF
order=()
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  name="${line%%:*}"; files="${line#*:}"
  DEF["$name"]="$files"
  [[ "$name" == @* ]] || order+=("$name")
done < "$MANIFEST"

expand() {
  local out=() t
  for t in $1; do
    if [[ "$t" == @* ]]; then out+=($(expand "${DEF[$t]}")); else out+=("$t"); fi
  done
  echo "${out[@]}"
}

suites=("${@:-${order[@]}}")
fail=0
for s in "${suites[@]}"; do
  [[ -n "${DEF[$s]:-}" ]] || { echo "Ismeretlen suite: $s" >&2; exit 2; }
  db="vc_scratch_${s}"
  dropdb --if-exists "$db" >/dev/null
  # a bootstrap-stub szerepköröket hoz létre; egy korábbi futás maradékát takarítjuk
  for r in anon authenticated service_role; do psql -d postgres -qtAc "drop role if exists $r" >/dev/null 2>&1 || true; done
  createdb "$db"
  args=()
  for f in $(expand "${DEF[$s]}"); do args+=(-f "$f"); done
  if out=$(psql -d "$db" -v ON_ERROR_STOP=1 -qtA "${args[@]}" 2>&1); then
    echo "PASS $s: $(echo "$out" | tail -1)"
  else
    echo "FAIL $s:"; echo "$out" | tail -5; fail=1
  fi
  dropdb --if-exists "$db" >/dev/null
done
exit $fail
