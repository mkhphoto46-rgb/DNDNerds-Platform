# Wispbyte free deployment

The free server `DNDNERDS1` runs one launch process on its assigned `SERVER_PORT`.
`index.js` migrates PostgreSQL, starts the private API on `127.0.0.1:4100`,
Next.js on `127.0.0.1:3100`, and WebVTT on `127.0.0.1:4200`. The public proxy
serves WebVTT at `/vtt/` and forwards Socket.IO upgrades. The public address is
`https://dndnerds.wispbyte.app/`.

Build the release on Windows with `./deploy/wispbyte/Build-Release.ps1`. The
five resulting `.tar.gz` files in `.deploy/wispbyte/` are each below the
file manager's 100 MiB upload limit. Upload and extract each archive in the
server root. Keep the expanded files and the persistent `data/vtt/` directory.

Set the server root `.env` using `.env.example`. Use the Supabase **session
pooler** connection string and the Upstash **TCP/TLS** (`rediss://`) URL.
Generate two distinct 32-byte hex keys. Never add real credentials to Git or
the release archives. The public app and API URLs both point to the Wispbyte
HTTPS subdomain. `FREE_LAUNCH_MODE=true` keeps catalog browsing available,
puts new accounts into `PENDING_APPROVAL`, and does not register live order,
payment, payout or email routes. Admins approve accounts in `/admin` after
reauthentication. The first admin needs to be provisioned through the database
after their own account is created and its ownership is confirmed.

An independent `VTT_BRIDGE_SECRET` of at least 32 characters is recommended. If omitted, the
launcher derives a distinct bridge key from the existing `AUTH_SESSION_SECRET` or `MFA_ENCRYPTION_KEY`.
`VTT_PUBLIC_URL=https://dndnerds.wispbyte.app/vtt/` is the URL the
site gives to players. The bridge signs one-minute, single-use launch links;
WebVTT uses the site account and creates a matching campaign on first entry.
Keep `data/vtt/` across releases: it contains campaigns, player characters,
maps, and local backups. The DM chooses PUBLIC or PRIVATE on the site; private
tables require a site invitation code. A rotated code prevents new joins with
the old code but does not remove players who have already joined.

This release starts a third service in the existing 512 MiB container. Verify
memory usage with several connected players before promoting it; the previous
memory test covered only the site and API. If the container exceeds its memory
limit, increase the Wispbyte plan's memory before hosting live games.

Start the server, then check `/`, `/store`, and registration through the public
URL. Check the server log for `Database migrations and public API restrictions
complete` and `DND Nerds API ready`. The release was locally tested with a
fresh PostgreSQL database and a 512 MiB memory limit.

Wispbyte requires signing in to the free account every two weeks to keep the
server online. Upstash Free and Supabase Free have separate usage quotas.
