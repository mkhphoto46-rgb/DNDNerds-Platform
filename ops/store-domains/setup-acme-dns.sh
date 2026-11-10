#!/usr/bin/env bash
# Run on the VPS as root. Does not request a certificate or edit nginx.
set -euo pipefail
umask 077
[[ $EUID == 0 ]] || { echo 'Run as root.' >&2; exit 1; }
public_ip=94.183.163.87
zone=_acme-challenge.dndnerds.ir
state=/etc/bind/dndnerds-acme
if command -v certbot >/dev/null && [[ $(readlink -f "$(command -v certbot)") == /snap/* ]]; then
  echo 'Snap Certbot detected; do not mix it with the apt RFC2136 plugin.' >&2; exit 1
fi
[[ ! -e $state && ! -e /etc/systemd/system/dndnerds-acme-dns.service ]] || { echo 'Already provisioned; inspect existing state, do not overwrite.' >&2; exit 1; }
ip -4 addr show | grep -Fq "$public_ip/" || { echo 'Expected public IPv4 is not assigned locally; review NAT/listen address.' >&2; exit 1; }
# A systemd-resolved stub on 127.0.0.53/.54 is compatible; never modify it.
if ss -H -lntu 'sport = :53' | awk '{print $5}' | grep -Ev '^(127\.0\.0\.(53|54))(%[^:]+)?:53$' | grep -q .; then
  echo 'Port 53 has a conflicting listener; inspect ss -lntup. No resolver changes made.' >&2; exit 1
fi
if dpkg-query -W -f='${Status}' bind9 2>/dev/null | grep -q 'install ok installed'; then
  echo 'Existing BIND installation requires manual integration; refusing overwrite.' >&2; exit 1
fi
[[ ! -e /etc/systemd/system/named.service && ! -e /etc/systemd/system/bind9.service ]] || { echo 'Existing service override/mask: review manually.' >&2; exit 1; }
backup=/root/dndnerds-acme-backup-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -m 700 "$backup"
for path in /etc/bind /etc/nginx /etc/letsencrypt /etc/ufw; do
  [[ ! -e $path ]] || cp -a --parents "$path" "$backup/"
done
printf '%s\n' "$backup" > /root/dndnerds-acme-last-backup
# Prevent the distro named service from starting with its recursive defaults.
systemctl mask named.service bind9.service
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y bind9 bind9-utils dnsutils certbot python3-certbot-dns-rfc2136
install -d -m 750 -o root -g bind "$state"
install -d -m 750 -o bind -g bind /var/lib/bind/dndnerds-acme
tsig-keygen -a hmac-sha256 dndnerds-acme > "$state/update.key"
chown root:bind "$state/update.key"; chmod 640 "$state/update.key"
cat > "$state/named.conf" <<EOF
include "$state/update.key";
options {
  directory "/var/lib/bind/dndnerds-acme";
  listen-on port 53 { 127.0.0.1; $public_ip; };
  listen-on-v6 { none; };
  recursion no;
  allow-recursion { none; };
  allow-query-cache { none; };
  allow-query { none; };
  allow-transfer { none; };
  dnssec-validation no;
  minimal-responses yes;
  version "not disclosed";
  pid-file "/var/lib/bind/dndnerds-acme/named.pid";
  session-keyfile "/var/lib/bind/dndnerds-acme/session.key";
};
controls { };
zone "$zone" {
  type primary;
  file "/var/lib/bind/dndnerds-acme/challenge.zone";
  allow-query { any; };
  allow-transfer { none; };
  notify no;
  update-policy { grant dndnerds-acme name $zone. TXT; };
};
EOF
cat > /var/lib/bind/dndnerds-acme/challenge.zone <<'EOF'
$TTL 60
@ IN SOA acme.dndnerds.ir. hostmaster.dndnerds.ir. ( 1 300 120 604800 60 )
@ IN NS acme.dndnerds.ir.
EOF
chown bind:bind /var/lib/bind/dndnerds-acme/challenge.zone
chown root:bind "$state/named.conf"
chmod 640 "$state/named.conf" /var/lib/bind/dndnerds-acme/challenge.zone
# Keep the secret inside root-only credential files; never print it.
install -d -m 700 /etc/letsencrypt/dndnerds-stores
python3 - "$state/update.key" <<'PY'
import pathlib, re, sys
secret = re.search(r'secret\s+"([^"]+)"', pathlib.Path(sys.argv[1]).read_text())[1]
p = pathlib.Path('/etc/letsencrypt/dndnerds-stores/rfc2136.ini')
p.write_text('dns_rfc2136_server = 127.0.0.1\ndns_rfc2136_port = 53\ndns_rfc2136_name = dndnerds-acme\ndns_rfc2136_secret = ' + secret + '\ndns_rfc2136_algorithm = HMAC-SHA256\n')
p.chmod(0o600)
PY
cat > /etc/systemd/system/dndnerds-acme-dns.service <<'EOF'
[Unit]
Description=Authoritative ACME challenge DNS only
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
ExecStartPre=/usr/sbin/named-checkconf /etc/bind/dndnerds-acme/named.conf
ExecStart=/usr/sbin/named -f -4 -u bind -c /etc/bind/dndnerds-acme/named.conf
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
named-checkconf "$state/named.conf"
named-checkzone "$zone" /var/lib/bind/dndnerds-acme/challenge.zone
systemctl daemon-reload
systemctl enable --now dndnerds-acme-dns.service
if command -v ufw >/dev/null && ufw status | grep -q '^Status: active'; then
  # Do not enable UFW or touch SSH rules. Provider firewall also needs both protocols.
  ufw allow in to "$public_ip" port 53 proto udp comment 'DND ACME DNS'
  ufw allow in to "$public_ip" port 53 proto tcp comment 'DND ACME DNS'
fi
dig @127.0.0.1 "$zone" SOA +norecurse +short | grep -q 'acme.dndnerds.ir.'
echo "DNS installed. Backup: $backup. Run validate-and-issue.sh only after delegation is live."
