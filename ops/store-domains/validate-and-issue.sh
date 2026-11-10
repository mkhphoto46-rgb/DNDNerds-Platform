#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || exit 1
[[ ${1:-} == staging || ${1:-} == production ]] || { echo 'Usage: bash validate-and-issue.sh staging|production EMAIL' >&2; exit 1; }
[[ ${2:-} == *@* ]] || { echo 'ACME account email required.' >&2; exit 1; }
zone=_acme-challenge.dndnerds.ir
# Check every current parent NS directly, rather than a stale recursive cache.
mapfile -t parents < <(dig @1.1.1.1 dndnerds.ir NS +short)
((${#parents[@]} > 0)) || { echo 'Parent NS lookup failed.' >&2; exit 1; }
for ns in "${parents[@]}"; do
  delegation=$(dig "@$ns" "$zone" NS +norecurse +noall +answer +authority)
  awk '$4 == "NS" { print tolower($5) }' <<< "$delegation" | grep -qx 'acme.dndnerds.ir.' || { echo "Delegation pending on $ns" >&2; exit 1; }
  for name in acme.dndnerds.ir probe-store-dns.dndnerds.ir; do
    [[ $(dig "@$ns" "$name" A +norecurse +short) == 94.183.163.87 ]] || { echo "A record pending for $name on $ns" >&2; exit 1; }
    [[ -z $(dig "@$ns" "$name" AAAA +norecurse +short) ]] || { echo "Unexpected IPv6 for $name; review before issuing." >&2; exit 1; }
  done
done
for resolver in 1.1.1.1 8.8.8.8; do
  dig "@$resolver" "$zone" SOA +short | grep -q '^acme.dndnerds.ir\.' || { echo "Delegation not visible via $resolver" >&2; exit 1; }
done
# Also test public authoritative service over UDP and TCP from an external host
# as documented in README. A VPS self-query alone does not prove ingress works.
dig @94.183.163.87 "$zone" SOA +norecurse +short | grep -q '^acme.dndnerds.ir\.'
dig @94.183.163.87 "$zone" SOA +tcp +norecurse +short | grep -q '^acme.dndnerds.ir\.'
args=(certonly --non-interactive --agree-tos --email "$2" --authenticator dns-rfc2136
  --dns-rfc2136-credentials /etc/letsencrypt/dndnerds-stores/rfc2136.ini
  --dns-rfc2136-propagation-seconds 120 -d '*.dndnerds.ir')
if [[ $1 == staging ]]; then
  # Separate state ensures an untrusted staging cert cannot enter production lineage.
  certbot "${args[@]}" --test-cert --cert-name dndnerds-stores-staging \
    --config-dir /var/lib/dndnerds-acme-staging/config --work-dir /var/lib/dndnerds-acme-staging/work --logs-dir /var/log/dndnerds-acme-staging
else
  certbot "${args[@]}" --cert-name dndnerds-stores
  openssl x509 -in /etc/letsencrypt/live/dndnerds-stores/fullchain.pem -noout -checkhost probe-store-dns.dndnerds.ir
  openssl x509 -in /etc/letsencrypt/live/dndnerds-stores/fullchain.pem -noout -checkend 86400
  # Installing a renewal hook does not enable the nginx vhost.
  install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
  install -m 750 "$(dirname "$0")/renew-nginx.sh" /etc/letsencrypt/renewal-hooks/deploy/50-dndnerds-stores
  systemctl enable --now certbot.timer
  systemctl is-enabled --quiet certbot.timer
  systemctl is-active --quiet certbot.timer
fi
