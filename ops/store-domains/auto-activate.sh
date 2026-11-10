#!/usr/bin/env bash
# Root-owned staged installation only. Never changes existing stream/apex configs.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
cd -- "$(dirname -- "$(readlink -f "$0")")"
exec 9>/opt/dndnerds/marketplace-release.lock
flock -n 9 || { echo 'Deployment in progress; waiting for next timer run.'; exit 0; }
exec 8>/run/dndnerds-store-domains-activate.lock
flock -n 8 || exit 0
state=/var/lib/dndnerds-store-domains
marker=/opt/dndnerds/store-domains-ready.json
available=/etc/nginx/sites-available/dndnerds-stores.conf
enabled=/etc/nginx/sites-enabled/dndnerds-stores.conf
install -d -m 700 "$state"
tmp=$(mktemp -d "$state/check.XXXXXX")
armed=0
marker_written=0
cleanup() {
  result=$?
  if ((result != 0 && armed == 1)); then
    echo 'Activation failed; removing this activation attempt and restoring nginx.' >&2
    ((marker_written == 0)) || rm -f -- "$marker"
    if [[ -L $enabled && $(readlink "$enabled") == "$available" ]]; then
      unlink "$enabled"
    fi
    if nginx -t; then systemctl reload nginx || echo 'ROLLBACK RELOAD FAILED; operator action required.' >&2;
    else echo 'ROLLBACK CONFIG TEST FAILED; operator action required.' >&2; fi
  fi
  rm -rf -- "$tmp"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT
fetch() {
  # No redirects: homepage/login redirects must not pass the store probe.
  curl --silent --show-error --connect-timeout 5 --max-time 30 "$@"
}
assert_store() {
  local file=$1
  grep -Fq 'id="shop-products"' "$file" && grep -Fq 'مورالین' "$file"
}
assert_status() {
  python3 - "$1" "$2" <<'PY'
import json, sys
v=json.load(open(sys.argv[1]))
assert v.get('domain') == 'dndnerds.ir' and v.get('enabled') is (sys.argv[2]=='true')
PY
}
unknown=unallocated-probe-$(date +%s).dndnerds.ir
if [[ -e $marker ]]; then
  # Completed installations are observed, never torn down by this timer.
  [[ $(fetch -o "$tmp/known" -w '%{http_code}' https://moralin.dndnerds.ir/) == 200 ]]
  assert_store "$tmp/known"
  fetch --fail -o "$tmp/status" https://dndnerds.ir/api/store-domains/status
  assert_status "$tmp/status" true
  echo 'Store domains are already active and healthy.'
  exit 0
fi
# All readiness checks precede any CA call or nginx mutation.
[[ $(fetch -H 'Host: moralin.dndnerds.ir' -o "$tmp/known" -w '%{http_code}' http://127.0.0.1:3100/) == 200 ]] || { echo 'Store app pending.'; exit 0; }
assert_store "$tmp/known" || { echo 'Store app response is not the expected storefront.'; exit 0; }
[[ $(fetch -H "Host: $unknown" -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/) == 404 ]] || { echo 'Unknown-store isolation pending.'; exit 0; }
fetch --fail -H 'Host: dndnerds.ir' -o "$tmp/status" http://127.0.0.1:3100/api/store-domains/status
assert_status "$tmp/status" false
if ! bash ./validate-and-issue.sh check; then
  echo 'DNS delegation is pending; no CA requests made.'
  exit 0
fi
certificate=/etc/letsencrypt/live/dndnerds-stores/fullchain.pem
valid_certificate() {
  [[ -s $certificate && -s /etc/letsencrypt/live/dndnerds-stores/privkey.pem ]] &&
  openssl x509 -in "$certificate" -noout -checkend 604800 >/dev/null &&
  openssl x509 -in "$certificate" -noout -checkhost moralin.dndnerds.ir >/dev/null &&
  openssl verify -CApath /etc/ssl/certs -untrusted /etc/letsencrypt/live/dndnerds-stores/chain.pem /etc/letsencrypt/live/dndnerds-stores/cert.pem >/dev/null
}
if ! valid_certificate; then
  now=$(date +%s)
  last=0
  [[ ! -f $state/last-ca-attempt ]] || read -r last < "$state/last-ca-attempt"
  [[ $last =~ ^[0-9]+$ ]] || { echo 'Invalid CA cooldown state.' >&2; exit 1; }
  if ((now - last < 86400)); then echo 'CA attempt cooldown active; next attempt after one day.'; exit 0; fi
  # Record before staging or production so timeouts/failures cannot hammer the CA.
  printf '%s\n' "$now" > "$state/last-ca-attempt"
  bash ./validate-and-issue.sh staging info@dndnerds.ir
  bash ./validate-and-issue.sh production info@dndnerds.ir
  valid_certificate
fi
# Reused certificates must also have the scoped renewal hook and running timer.
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
install -m 750 ./renew-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/50-dndnerds-stores
systemctl enable --now certbot.timer
systemctl is-enabled --quiet certbot.timer
systemctl is-active --quiet certbot.timer
source_hash=$(sha256sum stores.nginx.conf | awk '{print $1}')
if [[ -e $available || -L $available ]]; then
  [[ -f $state/owned-vhost.sha256 && ! -L $available ]] || { echo 'Existing unmanaged vhost; refusing overwrite.' >&2; exit 1; }
  read -r owned_hash < "$state/owned-vhost.sha256"
  [[ $(sha256sum "$available" | awk '{print $1}') == "$owned_hash" ]] || { echo 'Owned vhost changed externally; refusing overwrite.' >&2; exit 1; }
  cp -a -- "$available" "$state/vhost-backup-$(date -u +%Y%m%dT%H%M%SZ).conf"
fi
if [[ -e $enabled || -L $enabled ]]; then
  [[ -L $enabled && $(readlink "$enabled") == "$available" && -f $state/owned-vhost.sha256 ]] || { echo 'Existing unmanaged enabled vhost; refusing changes.' >&2; exit 1; }
fi
armed=1
install -m 644 stores.nginx.conf "$available"
printf '%s\n' "$source_hash" > "$state/owned-vhost.sha256"
[[ -L $enabled ]] || ln -s "$available" "$enabled"
nginx -t
systemctl reload nginx
[[ $(fetch --resolve moralin.dndnerds.ir:443:94.183.163.87 -o "$tmp/known" -w '%{http_code}' https://moralin.dndnerds.ir/) == 200 ]]
assert_store "$tmp/known"
[[ $(fetch --resolve "$unknown:443:94.183.163.87" -o /dev/null -w '%{http_code}' "https://$unknown/") == 404 ]]
[[ $(fetch --resolve dndnerds.ir:443:94.183.163.87 -o /dev/null -w '%{http_code}' https://dndnerds.ir/) == 200 ]]
python3 - "$marker" <<'PY'
import datetime,json,os,pathlib,sys,tempfile
p=pathlib.Path(sys.argv[1]); fd,t=tempfile.mkstemp(prefix=p.name+'.',dir=p.parent)
try:
    with os.fdopen(fd,'w') as f:
        json.dump({'enabled':True,'domain':'dndnerds.ir','activatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()},f)
        f.flush();os.fsync(f.fileno())
    os.chmod(t,0o644);os.replace(t,p)
finally:
    if os.path.exists(t):os.unlink(t)
PY
marker_written=1
fetch --fail --resolve dndnerds.ir:443:94.183.163.87 -o "$tmp/status" https://dndnerds.ir/api/store-domains/status
assert_status "$tmp/status" true
armed=0
systemctl disable --now dndnerds-store-domains.timer
echo 'Storefront wildcard HTTPS activated and readiness marker published.'
