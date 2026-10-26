"""Prepare a single-node LiveKit instance without printing its credentials."""

from pathlib import Path
from secrets import token_urlsafe

root = Path('/opt/dndnerds/livekit')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
config = root / 'livekit.yaml'
env = Path('/opt/dndnerds/app/.env')
if config.exists() or 'LIVEKIT_API_SECRET=' in env.read_text():
    raise SystemExit('LiveKit credentials already exist; refusing to rotate them')

key = token_urlsafe(12)
secret = token_urlsafe(36)
config.write_text(f'''port: 7880
log_level: info
redis:
  address: 127.0.0.1:6379
rtc:
  tcp_port: 7881
  udp_port: 7882
  node_ip: 94.183.163.87
  use_external_ip: false
keys:
  {key}: {secret}
turn:
  enabled: true
  domain: turn.94-183-163-87.sslip.io
  udp_port: 3478
  tls_port: 5349
  cert_file: /etc/letsencrypt/live/94-183-163-87.sslip.io/fullchain.pem
  key_file: /etc/letsencrypt/live/94-183-163-87.sslip.io/privkey.pem
''')
config.chmod(0o600)
with env.open('a') as output:
    output.write(f'\nLIVEKIT_URL=wss://voice.94-183-163-87.sslip.io\nLIVEKIT_API_KEY={key}\nLIVEKIT_API_SECRET={secret}\n')
env.chmod(0o600)
print('LiveKit configuration written')
