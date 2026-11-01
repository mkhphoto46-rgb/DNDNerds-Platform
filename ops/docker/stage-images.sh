#!/usr/bin/env bash
# Explicit invocation only, after runtime files and recovery snapshot review.
set -euo pipefail
archive=${1:?absolute image archive}; digest=${2:?sha256}; release=${3:?40-character commit}; settings=${4:?private Compose settings}
[[ "$release" =~ ^[a-f0-9]{40}$ && "$digest" =~ ^[a-f0-9]{64}$ ]]
[[ "$archive" = /* && "$settings" = /* && -f "$archive" && -f "$settings" ]]
test "$(sha256sum "$archive" | cut -d' ' -f1)" = "$digest"
export RELEASE_TAG="$release"
root=$(cd -- "$(dirname -- "$0")" && pwd)
docker compose --env-file "$settings" -f "$root/compose.production.yml" config --quiet
test -z "$(docker ps -aq --filter label=com.docker.compose.project=dndnerds-staged)"
docker image load -i "$archive"
for kind in web api; do
  test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "dndnerds-$kind:$release")" = linux/amd64
  test "$(docker image inspect --format '{{.Config.User}}' "dndnerds-$kind:$release")" = node
done
docker compose --env-file "$settings" -f "$root/compose.production.yml" up -d --wait api web
# No migration, worker, nginx reload, systemd restart, cleanup or prune.
echo 'STAGED: inspect private configuration and health before cutover approval.'
