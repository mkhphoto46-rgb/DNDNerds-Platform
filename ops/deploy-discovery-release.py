"""Approved Tadserver discovery release. Roll back runtime, never player data."""
from pathlib import Path
import hashlib, json, os, re, shutil, subprocess, sys, tarfile, time, urllib.request, urllib.parse


def copy_public_file(source, target):
    missing = []
    parent = target.parent
    while not parent.exists():
        missing.append(parent)
        parent = parent.parent
    for directory in reversed(missing):
        directory.mkdir()
        directory.chmod(0o755)
    shutil.copy2(source, target)
    target.chmod(0o644)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def pg(query):
    return subprocess.check_output(['docker', 'exec', 'dnd-postgres', 'psql', '-U', 'dndnerds', '-d', 'dndnerds', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], text=True).strip()


def get(url):
    with urllib.request.urlopen(url, timeout=5) as response:
        assert response.status == 200
        return response.read()


app, archive, metadata, snapshot = [Path(value).resolve() for value in sys.argv[1:5]]
assert app == Path('/opt/dndnerds/app')
assert snapshot.parent == app.parent / 'backups' and snapshot.name.startswith('join-before-')
meta = json.loads(metadata.read_text())
assert digest(archive) == meta['sha256']
assert all(digest(app / name) == value for name, value in meta['before'].items()), 'Live runtime changed'
backup = json.loads((snapshot / 'manifest.json').read_text())
assert backup['sqliteDatabases'] > 0
assert all(digest(snapshot / name) == value['sha256'] for name, value in backup['files'].items())
assert pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations') == '1793318400000', 'Migration baseline changed'
counts_query = 'SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM game_tables),(SELECT count(*) FROM game_table_reviews)'
counts_before = pg(counts_query)
subprocess.run(['node', str(app.parent / 'staging/auth-room-probe.cjs')], check=True)
seat_probe = ['node', str(app.parent / 'staging/discovery-seat-probe.cjs')]
if '--allow-active-seats' in sys.argv[5:]:
    seat_probe.append('--allow-active-seats')  # Explicit timing approval recorded in this conversation.
subprocess.run(seat_probe, check=True)
os.umask(0o077)
stage = app.parent / 'staging' / ('discovery-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
stage.mkdir(mode=0o700)
api = meta['apiFiles']
assert set(api) == {'app.js', 'db/schema.js', 'routes/game-hub.js', 'routes/profile-pages.js', 'routes/profile-image.js', 'routes/discovery-feedback.js', 'routes/table-deletion.js', 'integrations/vtt-table-deletion.js', 'jobs/table-deletion.js'}
migration_names = ['0031_discovery_feedback.sql', 'meta/_journal.json']
allowed = {'apps/api/dist/' + name for name in api} | {'apps/api/drizzle/' + name for name in migration_names} | {'apps/vtt/server/server.mjs'}
with tarfile.open(archive) as bundle:
    for item in bundle.getmembers():
        assert item.isfile() and '..' not in Path(item.name).parts and not item.name.startswith('/')
        assert item.name.startswith('apps/web/.next/') or item.name in allowed
    bundle.extractall(stage, filter='data')
assert (stage / 'apps/web/.next/BUILD_ID').read_text().strip() == meta['webBuild']
old_journal = json.loads((app / 'apps/api/drizzle/meta/_journal.json').read_text())
new_journal = json.loads((stage / 'apps/api/drizzle/meta/_journal.json').read_text())
assert new_journal['entries'][:-1] == old_journal['entries'], 'Earlier migration journal changed'
assert new_journal['entries'][-1]['tag'] == '0031_discovery_feedback'
assert new_journal['entries'][-1]['when'] == 1793491200000
subprocess.run(['node', '--check', str(stage / 'apps/vtt/server/server.mjs')], check=True)
for name in api:
    subprocess.run(['node', '--check', str(stage / 'apps/api/dist' / name)], check=True)
watched = [app / '.env', app / 'apps/web/support-public.json', app.parent / 'account-email.env', app.parent / 'livekit/voice-public.env']
preserved = {str(path): digest(path) for path in watched}
previous = []
for relative in ['apps/api/dist/' + name for name in api] + ['apps/vtt/server/server.mjs'] + ['apps/api/drizzle/' + name for name in migration_names]:
    source = app / relative
    if source.exists():
        target = snapshot / 'discovery-rollback' / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        previous.append(relative)
web_moved = False
try:
    assert all(digest(app / name) == value for name, value in meta['before'].items()), 'Live runtime changed'
    subprocess.run(['node', str(app.parent / 'staging/auth-room-probe.cjs')], check=True)
    subprocess.run(seat_probe, check=True)
    subprocess.run(['systemctl', 'stop', 'dndnerds'], check=True)
    counts_before = pg(counts_query)
    for name in migration_names:
        copy_public_file(stage / 'apps/api/drizzle' / name, app / 'apps/api/drizzle' / name)
    # Existing production migrator reads the existing private .env and applies
    # Drizzle migrations transactionally, including its migration ledger.
    subprocess.run(['runuser', '-u', 'dndnerds', '--', 'node', str(app / 'apps/api/dist/db/migrate-production.js')], cwd=app, check=True, timeout=90)
    assert pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations') == '1793491200000'
    assert pg(counts_query) == counts_before, 'Migration changed existing row counts'
    (app / 'apps/web/.next').rename(snapshot / 'discovery-old-next')
    web_moved = True
    shutil.copytree(stage / 'apps/web/.next', app / 'apps/web/.next')
    old_static = snapshot / 'discovery-old-next/static'
    for source in old_static.rglob('*'):
        if source.is_file():
            target = app / 'apps/web/.next/static' / source.relative_to(old_static)
            if not target.exists():
                copy_public_file(source, target)
    for name in api:
        copy_public_file(stage / 'apps/api/dist' / name, app / 'apps/api/dist' / name)
    copy_public_file(stage / 'apps/vtt/server/server.mjs', app / 'apps/vtt/server/server.mjs')
    for path in (app / 'apps/web/.next').rglob('*'):
        path.chmod(0o755 if path.is_dir() else 0o644)
    (app / 'apps/web/.next').chmod(0o755)
    subprocess.run(['chown', '-R', 'dndnerds:dndnerds', str(app / 'apps/web/.next')], check=True)
    subprocess.run(['systemctl', 'start', 'dndnerds'], check=True)
    for attempt in range(30):
        try:
            for url in ['http://127.0.0.1:4100/health/ready', 'http://127.0.0.1:4200/api/health', 'https://dndnerds.ir/find-game', 'https://dndnerds.ir/find-dm', 'https://dndnerds.ir/play', 'https://dndnerds.ir/vtt/']:
                get(url)
            for resource in ['tables', 'dms']:
                data = json.loads(get('https://dndnerds.ir/api/game-hub/' + resource))['data']
                assert isinstance(data, list)
                for row in data:
                    assert all(key in row for key in ['likes', 'dislikes', 'myVote', 'canReact', 'reviewCount', 'recentReviews'])
                    assert 'rating' not in row
                    assert row['canReact'] is False and row['myVote'] is None
                    if resource == 'dms':
                        assert 'bannerData' in row and 'avatarData' in row
            for page in ['find-game', 'find-dm']:
                html = get('https://dndnerds.ir/' + page).decode()
                assets = set(re.findall(r'(?:src|href)="(/_next/static/[^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"', html))
                assert assets, 'No web assets found'
                for asset in assets:
                    relative = urllib.parse.unquote(urllib.parse.urlsplit(asset).path).removeprefix('/_next/')
                    assert hashlib.sha256(get('https://dndnerds.ir' + asset)).hexdigest() == digest(app / 'apps/web/.next' / relative)
            break
        except Exception:
            if attempt == 29:
                raise
            time.sleep(2)
    assert preserved == {str(path): digest(Path(path)) for path in preserved}, 'Private settings changed'
    assert all(int(after) >= int(before) for after, before in zip(pg(counts_query).split('|'), counts_before.split('|'))), 'Existing row count decreased'
    result = {'released': True, 'webBuild': meta['webBuild'], 'archiveSha256': meta['sha256'], 'platformCommit': meta['platformCommit'], 'vttCommit': meta['vttCommit'], 'migration': '0031_discovery_feedback', 'privateSettingsPreserved': True, 'existingRowsPreserved': True}
    (snapshot / 'discovery-deployed.json').write_text(json.dumps(result))
    print(json.dumps(result), flush=True)
except BaseException:
    subprocess.run(['systemctl', 'stop', 'dndnerds'])
    if web_moved:
        (app / 'apps/web/.next').rename(snapshot / 'discovery-failed-next')
        (snapshot / 'discovery-old-next').rename(app / 'apps/web/.next')
    migration_applied = pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations') == '1793491200000'
    for relative in ['apps/api/dist/' + name for name in api] + ['apps/vtt/server/server.mjs'] + ['apps/api/drizzle/' + name for name in migration_names]:
        if relative.startswith('apps/api/drizzle/') and migration_applied:
            continue  # Additive migration and user feedback remain; never restore player data.
        target = app / relative
        if relative in previous:
            copy_public_file(snapshot / 'discovery-rollback' / relative, target)
        elif target.exists():
            target.unlink()
    subprocess.run(['systemctl', 'start', 'dndnerds'])
    raise
