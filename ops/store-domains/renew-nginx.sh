#!/usr/bin/env bash
set -euo pipefail
[[ ${RENEWED_LINEAGE:-} == /etc/letsencrypt/live/dndnerds-stores ]] || exit 0
openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -noout -checkhost probe-store-dns.dndnerds.ir >/dev/null
openssl x509 -in "$RENEWED_LINEAGE/fullchain.pem" -noout -checkend 86400 >/dev/null
nginx -t
systemctl reload nginx
