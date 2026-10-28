#!/usr/bin/env bash
set -euo pipefail
archive=${1:?archive}; expected=${2:?sha256}; build=${3:?build}; commit=${4:?commit}
app=/opt/dndnerds/app
stage=/opt/dndnerds/staging/play-profiles-20261029
backup=/opt/dndnerds/backups/play-profiles-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(cat "$app/apps/web/.next/BUILD_ID")" = 2Lg6qq7BfwIFPjyivTmwi
check() { test "$(sha256sum "$app/$1" | cut -d' ' -f1)" = "$2"; }
check apps/api/dist/routes/game-hub.js 7a245d872decac4907cb2924ccbd946f2474e195306ac807756333e64819514e
check apps/api/dist/routes/profile-pages.js e8f9a2e6359cc9c7731b7783a02626b0f38f6c628a4a8b051d51ce2a4223a9a7
check apps/api/dist/routes/profile-image.js de7f718b5b20fe2a6f3b7497b140b849ac27a786a0222b8347c3c21fab7811b6
check apps/api/dist/db/schema.js d1bc54888adade53edfe11eb1b93aee7f426af80a641e2bece54376f8096d9d0
check apps/api/drizzle/meta/_journal.json d8907001b00c3c0f059c570c00c9ac4b68fbe117fde1fb0359526e2fe0391303
install -d -m 700 "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
test "$(cat "$stage/apps/web/.next/BUILD_ID")" = "$build"
for rel in db/schema routes/game-hub routes/profile-image routes/profile-pages; do node --check "$stage/apps/api/dist/$rel.js"; done
sha256sum "$app/apps/vtt/server/server.mjs" > "$backup/vtt-server.sha256"
systemctl start dndnerds-backup.service
cp -a "$app/apps/api/dist" "$backup/api-dist"
cp -a "$app/apps/api/drizzle" "$backup/api-drizzle"
restore() {
 trap - ERR
 systemctl stop dndnerds || true
 if test -d "$backup/web-next"; then
  if test -d "$app/apps/web/.next"; then mv "$app/apps/web/.next" "$backup/failed-web-next"; fi
  mv "$backup/web-next" "$app/apps/web/.next"
 fi
 cp -a "$backup/api-dist/." "$app/apps/api/dist/"
 cp -a "$backup/api-drizzle/." "$app/apps/api/drizzle/"
 systemctl start dndnerds
 echo "ROLLED_BACK code=$backup; additive DB columns retained" >&2
 exit 1
}
trap restore ERR
systemctl stop dndnerds
mv "$app/apps/web/.next" "$backup/web-next"
cp -a "$stage/apps/web/.next" "$app/apps/web/.next"
cp -an "$backup/web-next/static/." "$app/apps/web/.next/static/"
cp -a "$stage/apps/api/dist/." "$app/apps/api/dist/"
cp -a "$stage/apps/api/drizzle/." "$app/apps/api/drizzle/"
chown -R dndnerds:dndnerds "$app/apps/web/.next" "$app/apps/api/dist" "$app/apps/api/drizzle"
systemctl start dndnerds
ready=false
for attempt in $(seq 1 25); do
 if curl -fsS http://127.0.0.1:4100/health/ready >/dev/null && curl -fsS http://127.0.0.1:4200/api/health >/dev/null && curl -fsS https://dndnerds.ir/play >/dev/null && curl -fsS https://dndnerds.ir/account/profile >/dev/null && curl -fsS https://dndnerds.ir/api/game-hub/tables >/dev/null && curl -fsS https://dndnerds.ir/api/game-hub/dms >/dev/null; then ready=true; break; fi
 sleep 2
done
test "$ready" = true
sha256sum --check "$backup/vtt-server.sha256"
printf '%s\n' "$commit" > /opt/dndnerds/platform-release-20261029.txt
echo "RELEASE_OK commit=$commit build=$build backup=$backup"
