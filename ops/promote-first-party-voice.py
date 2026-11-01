"""Promote an audited first-party voice route without rewriting secret environment files."""
from pathlib import Path
import hashlib, json, re, subprocess, sys, time, urllib.request

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def vtt_url():
    sockets = subprocess.check_output(['ss', '-ltnp', 'sport = :4200'], text=True)
    pid = re.search(r'pid=(\d+)', sockets).group(1)
    values = (Path('/proc') / pid / 'environ').read_bytes().split(b'\0')
    return next(value.split(b'=', 1)[1].decode() for value in values if value.startswith(b'LIVEKIT_URL='))

def ready():
    for url in ['http://127.0.0.1:4200/api/health', 'http://127.0.0.1:4100/health/ready', 'https://dndnerds.ir/support', 'https://dndnerds.ir/voice/']:
        with urllib.request.urlopen(url, timeout=3) as response:
            assert response.status == 200

backup = Path(sys.argv[1]).resolve()
assert backup.parent == Path('/opt/dndnerds/backups') and backup.name.startswith('voice-first-party-')
meta = json.loads((backup / 'trial.json').read_text())
nginx = Path(meta['path'])
block = meta['block']
assert nginx.read_text().count(block) == 1, 'Audited proxy block changed'
assert vtt_url() == 'wss://voice.94-183-163-87.sslip.io', 'Public endpoint changed concurrently'
public = Path('/opt/dndnerds/livekit/voice-public.env')
dropin = Path('/etc/systemd/system/dndnerds.service.d/60-voice-public-url.conf')
assert not public.exists() and not dropin.exists(), 'Existing override must be reviewed'
public_text = 'LIVEKIT_URL=wss://dndnerds.ir/voice\n'
dropin_text = '[Service]\nEnvironmentFile=/opt/dndnerds/livekit/voice-public.env\n'
watched = [Path('/opt/dndnerds/app/.env'), Path('/opt/dndnerds/app/apps/vtt/server/server.mjs'), Path('/opt/dndnerds/app/apps/vtt/dist/index.html'), Path('/opt/dndnerds/app/apps/web/.next/BUILD_ID')]
fingerprints = {str(path): digest(path) for path in watched}

# Do not interrupt human calls. The signing key stays inside the server process.
probe = r'''const crypto=require('node:crypto');process.loadEnvFile('/opt/dndnerds/app/.env');const now=Math.floor(Date.now()/1000);const a=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),b=Buffer.from(JSON.stringify({iss:process.env.LIVEKIT_API_KEY,sub:'ops-voice-probe',nbf:now-5,exp:now+60,video:{roomList:true}})).toString('base64url');const sig=crypto.createHmac('sha256',process.env.LIVEKIT_API_SECRET).update(a+'.'+b).digest('base64url');fetch('http://127.0.0.1:7880/twirp/livekit.RoomService/ListRooms',{method:'POST',headers:{Authorization:'Bearer '+a+'.'+b+'.'+sig,'Content-Type':'application/json'},body:'{}'}).then(async r=>{if(!r.ok)throw Error('Room probe '+r.status);const x=await r.json();const n=(x.rooms??[]).filter(r=>!r.name.startsWith('audit-voice-')&&r.numParticipants>0).length;console.log(JSON.stringify({activeHumanRooms:n}));if(n)process.exitCode=2}).catch(e=>{console.error(String(e));process.exitCode=3});'''
subprocess.run(['node', '-e', probe], check=True)
ready()
promoted_block = block.replace('# VOICE_FIRST_PARTY_TRIAL', '# Campaign voice signaling').replace('# END_VOICE_FIRST_PARTY_TRIAL', '# End campaign voice signaling')
created = []
assert fingerprints == {str(path): digest(path) for path in watched}, 'Runtime changed concurrently'
assert nginx.read_text().count(block) == 1, 'Proxy config changed concurrently'
proxy_changed = False
systemd_loaded = False
service_changed = False
try:
    with public.open('x') as stream: stream.write(public_text)
    created.append((public, public_text)); public.chmod(0o600)
    dropin.parent.mkdir(parents=True, exist_ok=True)
    with dropin.open('x') as stream: stream.write(dropin_text)
    created.append((dropin, dropin_text))
    current = nginx.read_text()
    assert current.count(block) == 1, 'Proxy config changed concurrently'
    proxy_changed = True
    nginx.write_text(current.replace(block, promoted_block, 1))
    subprocess.run(['nginx', '-t'], check=True, capture_output=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    systemd_loaded = True
    subprocess.run(['systemctl', 'daemon-reload'], check=True)
    service_changed = True
    subprocess.run(['systemctl', 'restart', 'dndnerds'], check=True)
    for attempt in range(30):
        try:
            ready()
            assert vtt_url() == 'wss://dndnerds.ir/voice'
            break
        except Exception:
            if attempt == 29: raise
            time.sleep(1)
    assert fingerprints == {str(path): digest(path) for path in watched}
    (backup / 'promotion.json').write_text(json.dumps({'url': 'wss://dndnerds.ir/voice', 'fingerprints': fingerprints}))
    print('FIRST_PARTY_VOICE_PROMOTED')
except Exception:
    for path, expected in reversed(created):
        if path.exists():
            assert path.read_text() == expected, 'Rollback conflict: ' + str(path)
            path.unlink()
    if proxy_changed:
        current = nginx.read_text()
        if promoted_block in current:
            nginx.write_text(current.replace(promoted_block, block, 1))
        subprocess.run(['nginx', '-t'], check=True, capture_output=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    if systemd_loaded:
        subprocess.run(['systemctl', 'daemon-reload'], check=True)
    if service_changed:
        subprocess.run(['systemctl', 'restart', 'dndnerds'], check=True)
    raise
