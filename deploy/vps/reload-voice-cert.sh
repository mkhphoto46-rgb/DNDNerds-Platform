#!/bin/sh
set -eu
nginx -t
systemctl reload nginx
docker restart dnd-livekit >/dev/null
