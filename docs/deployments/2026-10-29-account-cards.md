# Account card layout fix — 2026-10-29 Tehran

Runtime commit: `24b42db9f061b2d94b1825b086ed20420c698d42`
Build: `BbbpBhTcdCgjXUHQ42BUO`
Archive SHA256: `5f9efac9665fd5f71000645de6a708bee377e0cd30e5c9ee195d47de8e6c6854`
Previous web backup: `/opt/dndnerds/backups/account-cards-web-20261028T215600Z/web-next`

Root cause: account action markup has two children (copy and arrow), but its grid still reserved three tracks for the removed icon. The copy occupied the35px icon track; this produced word-by-word wrapping and tall cards. Replaced with text+arrow columns, shortened copy, reduced padding and type sizes, and used three group columns on wide screens. History is one compact full-width section; obsolete implementation copy removed.

Account server page passes the same FREE_LAUNCH_MODE flag used by API route registration. Intentionally disabled commerce now shows an explicit unavailable message and skips the unregistered orders request, without enabling commerce or inventing empty order data.

Verification: web typecheck and production build passed; independent review found no important regressions. Live signed-in browser measured profile action copy width35px and height183.5px before;264px and69.2px after. Desktop group tracks356px each. At320px mobile width, text195px and card67.2px high; document width305px, no horizontal overflow. All account destination links remain present. No account data was changed.

Web-only deployment used guarded ops/deploy-account-cards-web.sh via a transient systemd oneshot so SSH interruption could not strand the operation. Unit Result=success, ExecMainStatus=0, runtime marker/build verified. API and VTT health checks passed. Existing API, database, four-link menu and VTT preserved.
