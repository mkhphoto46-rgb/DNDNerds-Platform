"""Run only after explicit approval of this reviewed Tadserver hotfix.

No DNS, firewall, Compose, credential or database migration files are changed.
Rollback restores runtime files, never player data.
"""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, sys, tarfile, time, urllib.request

def copy_public_file(source, target):
    """Copy code/static files without overwriting existing directory metadata."""
    missing = []
    parent = target.parent
    while not parent.exists():
        missing.append(parent); parent = parent.parent
    for directory in reversed(missing):
        directory.mkdir(); directory.chmod(0o755)
    shutil.copy2(source,target)
    target.chmod(0o644)

app, archive, metadata, snapshot = map(lambda value: Path(value).resolve(), sys.argv[1:5])
meta = json.loads(metadata.read_text())
assert app.is_dir() and snapshot.parent == app.parent/'backups' and snapshot.name.startswith('join-before-')
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest() == meta['sha256']
expected = meta['before']
def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()
assert all(digest(app/name)==value for name,value in expected.items()), 'Live runtime changed; review again'
backup_meta = json.loads((snapshot/'manifest.json').read_text())
assert backup_meta['sqliteDatabases'] > 0
assert all(digest(snapshot/name)==value['sha256'] for name,value in backup_meta['files'].items()), 'Recovery snapshot damaged'
subprocess.run(['node',str(app.parent/'staging/auth-room-probe.cjs')],check=True)
os.umask(0o077)
stage = app.parent/'staging'/('join-fix-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
stage.mkdir(mode=0o700)
api = ['routes/game-hub.js','integrations/native-vtt-invite.js','integrations/vtt-origin.js']
with tarfile.open(archive) as bundle:
    for item in bundle.getmembers():
        assert item.isfile() and '..' not in Path(item.name).parts and not item.name.startswith('/')
        assert item.name.startswith(('apps/web/.next/','apps/vtt/dist/assets/')) or item.name in ['apps/api/dist/'+n for n in api]+['apps/vtt/server/server.mjs','apps/vtt/dist/index.html']
    bundle.extractall(stage,filter='data')
assert (stage/'apps/web/.next/BUILD_ID').read_text().strip() == meta['webBuild']
subprocess.run(['node','--check',str(stage/'apps/vtt/server/server.mjs')],check=True)
for source in (stage/'apps/vtt/dist/assets').rglob('*'):
    if source.is_file():
        target = app/'apps/vtt/dist/assets'/source.relative_to(stage/'apps/vtt/dist/assets')
        assert not target.exists() or digest(target)==digest(source), 'Hashed asset collision'
watched = [app/'.env', app/'apps/web/support-public.json', app.parent/'account-email.env', app.parent/'livekit/voice-public.env']
preserved = {str(p):digest(p) for p in watched}
previous_api = []
for name in api:
    source = app/'apps/api/dist'/name
    if source.exists():
        target = snapshot/'rollback-api'/name
        target.parent.mkdir(parents=True,exist_ok=True); shutil.copy2(source,target); previous_api.append(name)
shutil.copy2(app/'apps/vtt/server/server.mjs',snapshot/'rollback-vtt-server.mjs')
shutil.copy2(app/'apps/vtt/dist/index.html',snapshot/'rollback-vtt-index.html')
web_moved = False
try:
    # Last concurrency check immediately before the approved restart.
    assert all(digest(app/name)==value for name,value in expected.items())
    subprocess.run(['systemctl','stop','dndnerds'],check=True)
    (app/'apps/web/.next').rename(snapshot/'live-web-next'); web_moved=True
    shutil.copytree(stage/'apps/web/.next',app/'apps/web/.next')
    old_static=snapshot/'live-web-next/static'
    for old in old_static.rglob('*'):
        if old.is_file():
            new=app/'apps/web/.next/static'/old.relative_to(old_static)
            if not new.exists(): copy_public_file(old,new)
    for name in api:
        copy_public_file(stage/'apps/api/dist'/name,app/'apps/api/dist'/name)
    copy_public_file(stage/'apps/vtt/server/server.mjs',app/'apps/vtt/server/server.mjs')
    for source in (stage/'apps/vtt/dist/assets').rglob('*'):
        if source.is_file(): copy_public_file(source,app/'apps/vtt/dist/assets'/source.relative_to(stage/'apps/vtt/dist/assets'))
    copy_public_file(stage/'apps/vtt/dist/index.html',app/'apps/vtt/dist/index.html')
    for path in (app/'apps/web/.next').rglob('*'): path.chmod(0o755 if path.is_dir() else 0o644)
    (app/'apps/web/.next').chmod(0o755)
    subprocess.run(['chown','-R','dndnerds:dndnerds',str(app/'apps/web/.next')],check=True)
    subprocess.run(['systemctl','start','dndnerds'],check=True)
    for attempt in range(30):
        try:
            for url in ['http://127.0.0.1:4100/health/ready','http://127.0.0.1:4200/api/health','https://dndnerds.ir/play','https://dndnerds.ir/find-game','https://dndnerds.ir/vtt/']:
                with urllib.request.urlopen(url,timeout=3) as response: assert response.status==200
            assets = re.findall(r'(?:src|href)="(/vtt/assets/[^"\s]+\.(?:js|css))"',(app/'apps/vtt/dist/index.html').read_text())
            assert assets, 'No VTT bootstrap assets found'
            assets += ['/vtt/assets/'+p.name for p in (stage/'apps/vtt/dist/assets').glob('App-*.js')]
            for asset in assets:
                with urllib.request.urlopen('https://dndnerds.ir'+asset,timeout=5) as response:
                    assert response.status==200
                    assert hashlib.sha256(response.read()).hexdigest()==digest(app/'apps/vtt/dist'/asset.removeprefix('/vtt/'))
            break
        except Exception:
            if attempt==29: raise
            time.sleep(2)
    assert preserved=={str(p):digest(Path(p)) for p in preserved}, 'Private configuration changed'
    (snapshot/'deployed.json').write_text(json.dumps({'webBuild':meta['webBuild'],'archiveSha256':meta['sha256'],'preserved':preserved,'apiPrevious':previous_api}))
    print(json.dumps({'released':True,'webBuild':meta['webBuild'],'snapshot':str(snapshot)}))
except BaseException:
    subprocess.run(['systemctl','stop','dndnerds'])
    if web_moved:
        if (app/'apps/web/.next').exists(): (app/'apps/web/.next').rename(snapshot/'failed-web-next')
        (snapshot/'live-web-next').rename(app/'apps/web/.next')
    for name in api:
        target=app/'apps/api/dist'/name
        if name in previous_api: shutil.copy2(snapshot/'rollback-api'/name,target)
        elif target.exists(): target.unlink()
    shutil.copy2(snapshot/'rollback-vtt-server.mjs',app/'apps/vtt/server/server.mjs')
    shutil.copy2(snapshot/'rollback-vtt-index.html',app/'apps/vtt/dist/index.html')
    subprocess.run(['systemctl','start','dndnerds'])
    raise
