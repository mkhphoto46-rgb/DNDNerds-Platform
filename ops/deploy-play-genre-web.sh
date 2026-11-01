#!/usr/bin/env bash
set -euo pipefail
archive=${1:?archive}; digest=${2:?digest}; build=${3:?build}; commit=${4:?commit}
app=/opt/dndnerds/app/apps/web
stage=/opt/dndnerds/staging/play-genre-web-20261029
backup=/opt/dndnerds/backups/play-genre-web-$(date -u +%Y%m%dT%H%M%SZ)
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$digest"
test "$(cat "$app/.next/BUILD_ID")" = kBtKC3gXKb1Dz5aN4JLE7
install -d -m 700 "$stage" "$backup"
tar -xzf "$archive" -C "$stage"
test "$(cat "$stage/apps/web/.next/BUILD_ID")" = "$build"
restore() {
 trap - ERR
 systemctl stop dndnerds || true
 if test -d "$backup/web-next"; then
  if test -d "$app/.next"; then mv "$app/.next" "$backup/failed-web-next"; fi
  mv "$backup/web-next" "$app/.next"
 fi
 systemctl start dndnerds
 echo "ROLLED_BACK $backup" >&2
 exit 1
}
trap restore ERR
systemctl stop dndnerds
mv "$app/.next" "$backup/web-next"
cp -a "$stage/apps/web/.next" "$app/.next"
cp -a --update=none "$backup/web-next/static/." "$app/.next/static/"
chown -R dndnerds:dndnerds "$app/.next"
systemctl start dndnerds
ready=false
for attempt in $(seq 1 25); do
 if curl -fsS http://127.0.0.1:4100/health/ready >/dev/null && curl -fsS http://127.0.0.1:4200/api/health >/dev/null && curl -fsS https://dndnerds.ir/play >/dev/null && curl -fsS https://dndnerds.ir/create-game >/dev/null && curl -fsS https://dndnerds.ir/games >/dev/null && curl -fsS https://dndnerds.ir/tools >/dev/null && curl -fsS https://dndnerds.ir/account >/dev/null; then ready=true; break; fi
 sleep 2
done
test "$ready" = true
printf '%s\n' "$commit" > /opt/dndnerds/platform-release-20261029.txt
echo "RELEASE_OK $commit $build $backup"
