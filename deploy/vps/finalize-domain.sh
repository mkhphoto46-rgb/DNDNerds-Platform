#!/usr/bin/env bash
set -euo pipefail

target_ip=94.183.163.87
done_file=/opt/dndnerds/domain-ready
config_source=/opt/dndnerds/domain-https.conf
config_live=/etc/nginx/sites-enabled/dndnerds-domain-http.conf
config_backup=/etc/nginx/backups/dndnerds-domain-http.before-https.conf
env_file=/opt/dndnerds/app/.env

[[ ! -e "$done_file" ]] || exit 0

for nameserver in ns1.tadserver.com ns2.tadserver.com 1.1.1.1 8.8.8.8; do
    for domain in dndnerds.ir www.dndnerds.ir; do
        if ! dig "@$nameserver" "$domain" A +short +time=2 +tries=1 | grep -Fxq "$target_ip"; then
            exit 0
        fi
    done
done

certbot certonly --webroot -w /var/www/letsencrypt \
    --cert-name dndnerds.ir -d dndnerds.ir -d www.dndnerds.ir \
    --non-interactive --agree-tos --quiet

test -s /etc/letsencrypt/live/dndnerds.ir/fullchain.pem
mkdir -p /etc/nginx/backups
cp -p "$config_live" "$config_backup"
cp "$config_source" "$config_live"
if ! nginx -t; then
    cp -p "$config_backup" "$config_live"
    exit 1
fi
systemctl reload nginx

cp -p "$env_file" "${env_file}.before-domain"
python3 - "$env_file" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
values = {
    'PUBLIC_APP_URL': 'https://dndnerds.ir',
    'VTT_PUBLIC_URL': 'https://dndnerds.ir/vtt/',
}
lines = path.read_text().splitlines()
seen = set()
for index, line in enumerate(lines):
    key = line.split('=', 1)[0]
    if key in values:
        lines[index] = f'{key}={values[key]}'
        seen.add(key)
for key, value in values.items():
    if key not in seen:
        lines.append(f'{key}={value}')
path.write_text('\n'.join(lines) + '\n')
PY

systemctl restart dndnerds
for attempt in $(seq 1 30); do
    if curl --noproxy '*' -fsS -o /dev/null http://127.0.0.1:8080/ \
        && curl --noproxy '*' -fsS -o /dev/null http://127.0.0.1:4200/api/access-info \
        && curl --noproxy '*' --resolve dndnerds.ir:443:127.0.0.1 \
            -fsS -o /dev/null https://dndnerds.ir/; then
        touch "$done_file"
        echo 'dndnerds.ir HTTPS ready'
        exit 0
    fi
    sleep 2
done

cp -p "${env_file}.before-domain" "$env_file"
systemctl restart dndnerds
echo 'Domain certificate installed; app restart health check failed and env was restored' >&2
exit 1
