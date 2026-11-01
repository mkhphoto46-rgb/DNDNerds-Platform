"""Private additive recovery snapshot. No pruning or live service changes."""
from pathlib import Path
import hashlib, json, os, shutil, sqlite3, subprocess, sys, tarfile, time

app, destination, pg_container, pg_user, pg_database = sys.argv[1:6]
app = Path(app).resolve(); destination = Path(destination).resolve()
assert app.is_dir() and destination.is_dir() and app.is_absolute() and destination.is_absolute()
os.umask(0o077)
backup = destination / ('join-before-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
backup.mkdir(mode=0o700)
assert shutil.disk_usage(destination).free > 2 * 1024**3, 'Insufficient recovery disk space'
with (backup/'platform.dump').open('xb') as stream:
    subprocess.run(['docker','exec',pg_container,'pg_dump','-U',pg_user,'-d',pg_database,'--format=custom','--no-owner','--no-acl'],stdout=stream,check=True)
with (backup/'platform.dump').open('rb') as stream:
    subprocess.run(['docker','exec','-i',pg_container,'pg_restore','--list'],stdin=stream,stdout=subprocess.DEVNULL,check=True)
data = (app/'data/vtt').resolve()
count = 0
for source in data.rglob('*.sqlite'):
    relative = source.relative_to(data)
    if 'backups' in relative.parts: continue
    target = backup/'sqlite'/relative
    target.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as reader, sqlite3.connect(target) as writer:
        reader.backup(writer)
        assert writer.execute('pragma integrity_check').fetchone()[0] == 'ok'
    count += 1
with tarfile.open(backup/'media.tar.gz','w:gz') as bundle:
    def media_filter(item):
        parts = Path(item.name).parts
        if 'backups' in parts or item.name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm')): return None
        return item
    bundle.add(data,arcname='vtt-data',filter=media_filter)
with tarfile.open(backup/'runtime.tar.gz','w:gz') as bundle:
    for name in ['apps/web/.next','apps/api/dist','apps/vtt/server/server.mjs','apps/vtt/dist/index.html']:
        bundle.add(app/name,arcname=name)
with tarfile.open(backup/'private-config.tar.gz','w:gz') as bundle:
    bundle.add(app/'.env',arcname='app.env')
    for config in [Path('/etc/nginx'),Path('/etc/systemd/system/dndnerds.service'),Path('/etc/systemd/system/dndnerds.service.d')]:
        if config.exists(): bundle.add(config,arcname='host-config/'+config.name)
for name in ['runtime.tar.gz','media.tar.gz','private-config.tar.gz']:
    with tarfile.open(backup/name) as bundle:
        for item in bundle:
            if item.isfile():
                with bundle.extractfile(item) as stream:
                    while stream.read(1024*1024): pass
manifest = {str(p.relative_to(backup)):{'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in backup.rglob('*') if p.is_file()}
(backup/'manifest.json').write_text(json.dumps({'createdAt':time.time(),'sqliteDatabases':count,'files':manifest}))
print(json.dumps({'backup':str(backup),'sqliteDatabasesChecked':count,'postgresArchiveChecked':True,'archivesChecked':True}))
