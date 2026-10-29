#!/usr/bin/env bash
set -euo pipefail
archive=${1:?archive}; expected=${2:?sha}; build=${3:?build}; commit=${4:?commit}
app=/opt/dndnerds/app
stage=/opt/dndnerds/staging/support-feedback-20261029
settings=/opt/dndnerds/staging/support-settings-20261029.json
backup=/opt/dndnerds/backups/support-feedback-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$expected"
test "$(cat "$app/apps/web/.next/BUILD_ID")" = BbbpBhTcdCgjXUHQ42BUO
check() { test "$(sha256sum "$app/$1" | cut -d' ' -f1)" = "$2"; }
check apps/api/dist/routes/profile-pages.js 1974d215d0a3c63446c510cf7756d4737cf22eef9856b25950f33b684f886653
check apps/api/dist/routes/profile-image.js 2e0135884bfb822d22260e9c631d686fc10c794a1b4493e1b954beca2672ceeb
check apps/api/dist/db/schema.js f901ad2fdb1688cef6aed1c790947920f950f20843f21d541c7f848e8db3c863
check apps/api/dist/routes/admin.js 7e5827e3dd27b173905b1d9c12bd5db073ce3479900c8528c9ae090ec34b330a
check apps/api/drizzle/meta/_journal.json bbbed889d937a995fcf8488ed3c4fda62417f5722f89753995d31df9c524e33a
node -e 'const d=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); for(const k of ["SUPPORT_RECIPIENT_NAME","SUPPORT_ACCOUNT_NUMBER","SUPPORT_IBAN"]) if(typeof d[k]!=="string"||!d[k].trim()) throw Error("Missing public support field");' "$settings"
install -d -m 700 "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
test "$(cat "$stage/apps/web/.next/BUILD_ID")" = "$build"
for rel in db/schema routes/admin routes/profile-pages routes/profile-image routes/feedback; do node --check "$stage/apps/api/dist/$rel.js"; done
systemctl start dndnerds-backup.service
cp -a "$app/apps/api/dist" "$backup/api-dist"
cp -a "$app/apps/api/drizzle" "$backup/api-drizzle"
if test -f "$app/apps/web/support-public.json"; then cp -a "$app/apps/web/support-public.json" "$backup/support-public.json"; fi
sha256sum "$app/apps/vtt/server/server.mjs" > "$backup/vtt-server.sha256"
sha256sum "$app/.env" > "$backup/environment.sha256"
restore() {
 trap - ERR
 systemctl stop dndnerds || true
 if test -d "$backup/web-next"; then
  if test -d "$app/apps/web/.next"; then mv "$app/apps/web/.next" "$backup/failed-web-next"; fi
  mv "$backup/web-next" "$app/apps/web/.next"
 fi
 cp -a "$backup/api-dist/." "$app/apps/api/dist/"
 cp -a "$backup/api-drizzle/." "$app/apps/api/drizzle/"
 if test -f "$backup/support-public.json"; then cp -a "$backup/support-public.json" "$app/apps/web/support-public.json"; fi
 systemctl start dndnerds
 echo "ROLLED_BACK $backup; additive DB changes retained" >&2
 exit 1
}
trap restore ERR
systemctl stop dndnerds
mv "$app/apps/web/.next" "$backup/web-next"
cp -a "$stage/apps/web/.next" "$app/apps/web/.next"
cp -a --update=none "$backup/web-next/static/." "$app/apps/web/.next/static/"
cp -a "$stage/apps/api/dist/." "$app/apps/api/dist/"
cp -a "$stage/apps/api/drizzle/." "$app/apps/api/drizzle/"
install -m 600 -o dndnerds -g dndnerds "$settings" "$app/apps/web/support-public.json"
chown -R dndnerds:dndnerds "$app/apps/web/.next" "$app/apps/api/dist" "$app/apps/api/drizzle"
systemctl start dndnerds
ready=false
for attempt in $(seq 1 30); do
 if curl -fsS http://127.0.0.1:4100/health/ready >/dev/null && curl -fsS http://127.0.0.1:4200/api/health >/dev/null && curl -fsS https://dndnerds.ir/support >/dev/null && curl -fsS https://dndnerds.ir/feedback >/dev/null && curl -fsS https://dndnerds.ir/account/profile >/dev/null && curl -fsS https://dndnerds.ir/play >/dev/null; then ready=true; break; fi
 sleep 2
done
test "$ready" = true
curl -fsS http://127.0.0.1:4100/api/v1/subscriptions/plan | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; assert d["free"] and d["priceRial"]==0 and not d["checkoutAvailable"]'
test "$(curl -s -o /dev/null -w '%{http_code}' https://dndnerds.ir/api/game-hub/feedback/me)" = 401
test "$(curl -s -o /dev/null -w '%{http_code}' https://dndnerds.ir/api/game-hub/admin/feedback)" = 403
sha256sum --check "$backup/vtt-server.sha256"
sha256sum --check "$backup/environment.sha256"
printf '%s\n' "$commit" > /opt/dndnerds/platform-release-20261029.txt
echo "RELEASE_OK commit=$commit build=$build backup=$backup"
