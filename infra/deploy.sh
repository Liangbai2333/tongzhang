#!/usr/bin/env bash
# Run on the deployment host. Requires Docker Compose and curl, not Node/pnpm.
set -euo pipefail
umask 077
infra_dir=$(cd "$(dirname "$0")" && pwd)
env_file="${1:-$infra_dir/.env}"
if [ ! -f "$env_file" ]; then echo 'Missing deployment .env; copy infra/.env.example and configure it.' >&2; exit 1; fi
command -v curl >/dev/null
compose=(docker compose --env-file "$env_file" -f "$infra_dir/compose.prod.yml")
"${compose[@]}" config --quiet
if ! mkdir "$infra_dir/.deploy.lock"; then echo 'Another deployment is running; inspect it before removing a stale lock.' >&2; exit 1; fi
trap 'rmdir "$infra_dir/.deploy.lock"' EXIT
"${compose[@]}" pull postgres server caddy
"${compose[@]}" up -d --wait --wait-timeout 90 postgres
mkdir -p "$infra_dir/backups"
backup="$infra_dir/backups/$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup.partial"
mv "$backup.partial" "$backup"
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --wait --wait-timeout 120 server caddy
api_domain=$("${compose[@]}" exec -T caddy printenv API_DOMAIN)
# Wait for initial certificate issuance, retrying this read-only health check only.
curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-all-errors --connect-timeout 5 --max-time 10 "https://${api_domain}/health/ready"
image_id=$("${compose[@]}" images -q server)
printf '\n%s image=%s backup=%s\n' "$(date -u +%FT%TZ)" "$image_id" "$backup" >> "$infra_dir/.deployments.log"
echo 'Deployment passed database migration, container health and public HTTPS readiness checks.'
