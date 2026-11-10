# Wildcard storefront TLS on Tadserver

Prepared configuration, not evidence of deployment. Target: Ubuntu VPS
`94.183.163.87`. Keep the existing `dndnerds.ir` apex + www Certbot lineage,
public 443 stream SNI map, TURN routing, apex HTTP vhost and local resolver intact.
The new lineage covers `*.dndnerds.ir` only. No HTTP-01 challenge is required.

## DNS prerequisite

Tad support must publish these records in the existing parent zone; do not change
the main domain nameservers:

| Owner | Type | Value |
| --- | --- | --- |
| `*.dndnerds.ir` | A | `94.183.163.87` |
| `acme.dndnerds.ir` | A | `94.183.163.87` |
| `_acme-challenge.dndnerds.ir` | NS | `acme.dndnerds.ir.` |

Check that inherited/existing CAA permits Let's Encrypt, there is no conflicting
challenge CNAME, stale DS delegation, or unintended AAAA route. Negative DNS caches
can remain after support applies the records. One authoritative server is a renewal
availability dependency; monitoring and retained backups are necessary.

## Install DNS (root, on VPS)

Copy this directory to a root-owned deployment directory; do not print or download
the generated secrets. Run `bash setup-acme-dns.sh` once. It snapshots existing
BIND/nginx/Certbot/UFW files under the root-only backup directory recorded in
`/root/dndnerds-acme-last-backup`. It refuses existing BIND provisioning and port
conflicts. The existing resolved listeners on `127.0.0.53` and `.54` are permitted.
It does not edit `/etc/resolv.conf`, systemd-resolved, or nginx.

The distro `named.service` / `bind9.service` are masked before apt installation to
prevent accidental default recursive DNS startup. Only
`dndnerds-acme-dns.service` runs, using the custom config under `/etc/bind` and a
dynamic zone under `/var/lib/bind` (compatible with Ubuntu named AppArmor paths).
The only public authoritative zone is `_acme-challenge.dndnerds.ir`; transfers,
recursion and cache queries are disabled. The TSIG key can change only the exact
zone-apex TXT RRset. Local credentials use IPv4 loopback. TSIG authenticates updates;
it does not encrypt them, which is why Certbot uses loopback. Never enable shell
tracing or print the key / credentials. Backups also contain sensitive data.

If setup fails, stop and inspect `systemctl status dndnerds-acme-dns` and
`journalctl -u dndnerds-acme-dns`; the script deliberately refuses a blind rerun.
Do not restore the whole backup over concurrent production changes.

## Validate and issue only after DNS is live

From another machine, verify BOTH protocols and refusal of unrelated queries:

```sh
dig @94.183.163.87 _acme-challenge.dndnerds.ir SOA +norecurse
dig @94.183.163.87 _acme-challenge.dndnerds.ir SOA +tcp +norecurse
dig @94.183.163.87 example.org A +recurse
dig @94.183.163.87 _acme-challenge.dndnerds.ir AXFR
```

The first two must return authoritative (`aa`) SOA responses. The third must return
REFUSED without recursion availability (`ra`); the transfer must fail. Provider
firewall must allow incoming TCP+UDP 53. Setup adds scoped UFW rules only if UFW is
already active; it never enables UFW. Confirm no newly exposed listeners with
`ss -lntup`. Check `named-checkconf /etc/bind/dndnerds-acme/named.conf`.

```sh
bash validate-and-issue.sh staging YOUR_ACME_ACCOUNT_EMAIL
bash validate-and-issue.sh production YOUR_ACME_ACCOUNT_EMAIL
```

The script fails before issuance if parent delegation/A records or recursive SOA
visibility are missing. A successful staging challenge is the end-to-end DNS update
and cleanup test; it uses separate Certbot state and cannot install an untrusted
staging certificate into the production lineage. Run production only after staging
succeeds. Do not add `--expand`, `--force-renewal`, or rename the apex lineage.
Public CA DNS validation still determines issuance (CAA, DNSSEC and firewall errors
must be resolved, not bypassed). Inspect `certbot certificates` without printing
private keys.

## Enable nginx after application rollout and certificate issuance

Review `nginx -T` locally (it may contain sensitive configuration). Confirm:

- Public 443 remains owned by the existing stream listener. Its default SNI route
  reaches `127.0.0.1:8443` with `proxy_protocol on`; TURN retains its special route.
- Existing apex and www exact server names take precedence. Keep their configs and
  current certificates untouched. There must be no earlier conflicting regex vhost.
- The reserved-name list in `stores.nginx.conf` agrees with application policy.
  Existing explicit service vhosts retain precedence; this regex alone does not
  define the default-vhost response for excluded hosts. Verify current default
  behavior before activation. Unknown accepted store names must return app 404.
- The new port-80 regex vhost redirects the same accepted store hosts to HTTPS
  with status 308, preserving the URI and query. Existing exact apex/service
  vhosts retain precedence. Store labels are 3–63 characters with single internal
  hyphens, matching the API. Keep `acme` reserved in both lists.
- The app on `127.0.0.1:8080` recognizes the sanitized host and proxies only from
  trusted loopback ingress. HTTPS host routing must be deployed before activation.

Activate as a separate file, preserving originals:

```sh
test -s /etc/letsencrypt/live/dndnerds-stores/fullchain.pem
test ! -e /etc/nginx/sites-available/dndnerds-stores.conf
test ! -e /etc/nginx/sites-enabled/dndnerds-stores.conf
install -m 644 stores.nginx.conf /etc/nginx/sites-available/dndnerds-stores.conf
ln -s /etc/nginx/sites-available/dndnerds-stores.conf /etc/nginx/sites-enabled/dndnerds-stores.conf
if nginx -t; then
  systemctl reload nginx
else
  unlink /etc/nginx/sites-enabled/dndnerds-stores.conf
  exit 1
fi
```

If reload fails, unlink only the new site, run `nginx -t`, and reload the previous
configuration. Do not restart nginx before config validation. Validate external TLS
with `openssl s_client -connect 94.183.163.87:443 -servername KNOWNSTORE.dndnerds.ir
-verify_hostname KNOWNSTORE.dndnerds.ir </dev/null`; check known store, unknown store
404, reserved names, apex/www and TURN/voice operation. Test host spoofing through
X-Forwarded-Host/Proto headers; the app must still use the actual incoming host.

## Renewal and rollback

Confirm `systemctl list-timers certbot.timer`, `systemctl is-enabled certbot.timer`,
and `certbot renew --cert-name dndnerds-stores --dry-run`. If apt's renewal timer is
not enabled, enable it with `systemctl enable --now certbot.timer`. Production
issuance automatically enables the timer and verifies it is enabled and active. The new deploy
hook checks the renewed wildcard certificate and tests nginx before reload; it
ignores the apex lineage. Do not run hooks against staging certificates. Check
renewal logs and certificate expiry; a timer alone does not prove renewal works.

To withdraw storefront TLS: unlink only
`/etc/nginx/sites-enabled/dndnerds-stores.conf`, test nginx and reload. This restores
the previous on-disk vhost set. Do not delete the existing apex certificate.
Stop/disable `dndnerds-acme-dns.service` only after accepting that wildcard renewal
will fail until it is restored. To undo setup, remove only the newly created unit,
custom config directory, zone directory and hook after a protected backup, then
`systemctl daemon-reload`. Remove only the UFW rules this setup added, identified
by the `DND ACME DNS` comment (avoid deleting pre-existing DNS rules). Leave distro
named masked unless deliberately provisioning a replacement; unmasking alone must
not start the default recursive service. Package installation is not automatically
reversed. Coordinate removal of parent delegation with Tad before retiring DNS.

References: [official RFC2136 Certbot plugin](https://certbot-dns-rfc2136.readthedocs.io/en/latest/),
[BIND configuration reference](https://bind9.readthedocs.io/en/stable/reference.html).
