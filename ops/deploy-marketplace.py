"""Guarded catalog/draft release. Restore-test PostgreSQL first; never enable live money."""
from pathlib import Path
import fcntl, hashlib, json, os, re, shutil, socket, subprocess, sys, tarfile, time, urllib.request, urllib.error
from marketplace_release_files import restore_web, validate_journal_upgrade

APP = Path('/opt/dndnerds/app')
BASE = APP.parent
os.umask(0o077)
release_lock=(BASE/'marketplace-release.lock').open('a')
fcntl.flock(release_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)

def sha(p):
    with Path(p).open('rb') as f: return hashlib.file_digest(f,'sha256').hexdigest()
def pg(sql, database='dndnerds'):
    return subprocess.check_output(['docker','exec','dnd-postgres','psql','-U','dndnerds','-d',database,'-At','-v','ON_ERROR_STOP=1','-c',sql],text=True).strip()
def get(url, expected=200, body=None, headers=None):
    request=urllib.request.Request(url,data=body,headers=headers or {})
    try:
        with urllib.request.urlopen(request,timeout=8) as response:
            status=response.status; data=response.read()
    except urllib.error.HTTPError as error: status=error.code;data=error.read()
    assert status==expected, f'{url}: {status}, expected {expected}'
    return data
def copy_file(source,target):
    missing=[]; parent=target.parent
    while not parent.exists(): missing.append(parent);parent=parent.parent
    for directory in reversed(missing): directory.mkdir();directory.chmod(0o755)
    shutil.copy2(source,target);target.chmod(0o644)
def count_rows(database='dndnerds'):
    return pg('SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM game_tables),(SELECT count(*) FROM marketplace_orders),(SELECT count(*) FROM products)',database)

archive,metadata=[Path(v).resolve() for v in sys.argv[1:3]]
meta=json.loads(metadata.read_text())
assert archive.parent==BASE/'staging' and metadata.parent==BASE/'staging'
assert sha(archive)==meta['sha256']
assert (APP/'apps/web/.next/BUILD_ID').read_text().strip()==meta['beforeBuild']
assert all(sha(APP/name)==value for name,value in meta['before'].items()), 'Live runtime changed'
baseline_migration=pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations')
assert baseline_migration==meta['migrationWhen']
target_migration=str(meta.get('targetMigrationWhen','1793577600000'))
old_journal=json.loads((APP/'apps/api/drizzle/meta/_journal.json').read_text())
stage=BASE/'staging'/('marketplace-'+time.strftime('%Y%m%dT%H%M%SZ',time.gmtime()))
stage.mkdir(mode=0o700)
with tarfile.open(archive) as bundle:
    for item in bundle.getmembers():
        assert item.isfile() and not item.issym() and '..' not in Path(item.name).parts and not item.name.startswith('/')
        assert item.name.startswith(('apps/web/.next/','apps/api/dist/','apps/api/drizzle/'))
    bundle.extractall(stage,filter='data')
assert (stage/'apps/web/.next/BUILD_ID').read_text().strip()==meta['webBuild']
new_journal=json.loads((stage/'apps/api/drizzle/meta/_journal.json').read_text())
pending_migrations=validate_journal_upgrade(old_journal,new_journal,baseline_migration,target_migration)
for entry in old_journal['entries']:
    path='apps/api/drizzle/'+entry['tag']+'.sql'
    if (stage/path).exists():assert sha(stage/path)==sha(APP/path), 'Applied migration content changed'
migration_paths=pending_migrations+['apps/api/drizzle/meta/_journal.json']
for name in meta['apiFiles']: subprocess.run(['node','--check',str(stage/'apps/api/dist'/name)],check=True)
# Validate the exact intended mixed runtime, preserving unrelated live patches.
for source in (APP/'apps/api/dist').rglob('*.js'):
    relative=source.relative_to(APP/'apps/api/dist').as_posix()
    if relative not in meta['apiFiles']:copy_file(source,stage/'apps/api/dist'/relative)
(stage/'apps/api/node_modules').symlink_to(APP/'apps/api/node_modules',target_is_directory=True)

# The snapshotter is already reviewed/deployed; it checkpoints SQLite backups,
# checks every archive and writes a private SHA256 manifest without pruning data.
snapshot_result=subprocess.check_output(['python3',str(BASE/'staging/backup-join-release.py'),str(APP),str(BASE/'backups'),'dnd-postgres','dndnerds','dndnerds'],text=True)
snapshot=Path(json.loads(snapshot_result.strip().splitlines()[-1])['backup']).resolve()
assert snapshot.parent==BASE/'backups'
manifest=json.loads((snapshot/'manifest.json').read_text())
assert manifest['sqliteDatabases']>0
assert all(sha(snapshot/name)==entry['sha256'] for name,entry in manifest['files'].items())

restore_db='dnd_marketplace_restore_'+str(time.time_ns())
assert restore_db.startswith('dnd_marketplace_restore_') and restore_db.replace('_','').isalnum()
restore_started=time.monotonic();process=None
runtime_env=dict(os.environ)
live_socket=subprocess.check_output(['ss','-ltnp','sport = :4100'],text=True)
live_pid=re.search(r'pid=(\d+)',live_socket)
assert live_pid, 'Cannot identify live API listener'
proc=Path('/proc')/live_pid.group(1)
assert 'apps/api/dist/server.js' in (proc/'cmdline').read_bytes().replace(b'\0',b' ').decode()
values=(proc/'environ').read_bytes().split(b'\0')
runtime_env.update(dict(v.decode().split('=',1) for v in values if b'=' in v))
free_launch=runtime_env.get('FREE_LAUNCH_MODE')
if free_launch is None:
    free_launch='true' if re.search(r'''(?m)^FREE_LAUNCH_MODE\s*=\s*["']?true["']?\s*$''',(APP/'.env').read_text()) else None
assert free_launch=='true', 'Rollback requires free-launch financial writes to remain disabled'
watched=[APP/'.env',APP/'apps/web/support-public.json',BASE/'account-email.env',BASE/'livekit/voice-public.env']
preserved={str(p):sha(p) for p in watched if p.exists()}
pg(f'CREATE DATABASE "{restore_db}" TEMPLATE template0')
try:
    with (snapshot/'platform.dump').open('rb') as stream:
        subprocess.run(['docker','exec','-i','dnd-postgres','pg_restore','-U','dndnerds','--no-owner','--no-acl','--exit-on-error','-d',restore_db],stdin=stream,check=True,stdout=subprocess.DEVNULL)
    restored_counts=count_rows(restore_db)
    # dotenv stays server-side. Only DATABASE_URL's database component changes.
    wrapper=stage/'stage-run.cjs'
    wrapper.write_text("const path=require('path');require('/opt/dndnerds/app/apps/api/node_modules/dotenv').config({path:'/opt/dndnerds/app/.env',quiet:true});const u=new URL(process.env.DATABASE_URL);u.pathname='/'+process.argv[2];process.env.DATABASE_URL=u.href;process.env.NODE_ENV='production';process.env.FREE_LAUNCH_MODE='true';process.env.TABLE_DELETION_WORKER_ENABLED='false';process.env.VTT_INTERNAL_URL='http://127.0.0.1:1';process.env.VTT_BRIDGE_SECRET='';process.env.API_HOST='127.0.0.1';process.env.API_PORT='24198';require(path.resolve(process.argv[3]));")
    subprocess.run(['node',str(wrapper),restore_db,str(stage/'apps/api/dist/db/migrate-production.js')],cwd=stage,env=runtime_env,check=True,timeout=120)
    assert count_rows(restore_db)==restored_counts
    assert pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations',restore_db)==target_migration
    assert pg('SELECT count(*) FROM (SELECT transaction_id FROM financial_ledger_postings GROUP BY transaction_id HAVING sum(amount_rial)<>0)x',restore_db)=='0'
    # Readiness only: no VTT worker, carrier, SMS or payment action is launched.
    with socket.socket() as probe:
        probe.settimeout(1)
        assert probe.connect_ex(('127.0.0.1',24198))!=0, 'Staging port already occupied'
    log=(snapshot/'staging-api.log').open('wb')
    process=subprocess.Popen(['node',str(wrapper),restore_db,str(stage/'apps/api/dist/server.js')],cwd=stage,env=runtime_env,stdout=log,stderr=subprocess.STDOUT)
    for attempt in range(30):
        try: get('http://127.0.0.1:24198/health/ready');break
        except Exception:
            if process.poll() is not None or attempt==29: raise
            time.sleep(1)
    assert process.poll() is None
    assert f'pid={process.pid},' in subprocess.check_output(['ss','-ltnp','sport = :24198'],text=True)
    assert json.loads(get('http://127.0.0.1:24198/api/v1/products'))['source']=='postgresql'
    assert len(json.loads(get('http://127.0.0.1:24198/api/v1/marketplace/v21/categories'))['data'])==5
    get('http://127.0.0.1:24198/api/v1/marketplace/v21/seller/apply',401,b'{}',{'Content-Type':'application/json'})
    get('http://127.0.0.1:24198/api/v1/marketplace/v21/checkout/preview',503,b'{}',{'Content-Type':'application/json'})
    get('http://127.0.0.1:24198/api/v1/payments/webhooks/mock',404,b'{}',{'Content-Type':'application/json'})
    for path in meta.get('disabledMutationProbes',[]):
        assert path.startswith('/api/v1/marketplace/v21/admin/') and '..' not in path
        get('http://127.0.0.1:24198'+path,503,b'{}',{'Content-Type':'application/json'})
    result={'restoreVerified':True,'restoreSeconds':round(time.monotonic()-restore_started,2),'restoredCounts':restored_counts,'stagingHealthVerified':True,'financialWritesDisabled':True}
    (snapshot/'marketplace-restore.json').write_text(json.dumps(result))
finally:
    if process:
        process.terminate()
        try:process.wait(timeout=15)
        except subprocess.TimeoutExpired:process.kill();process.wait()
    pg(f'DROP DATABASE "{restore_db}" WITH (FORCE)')

# The old release's free-launch configuration is a rollback invariant.
assert preserved=={p:sha(p) for p in preserved}
assert all(sha(APP/name)==value for name,value in meta['before'].items())
rooms=json.loads(subprocess.check_output(['node',str(BASE/'staging/auth-room-probe.cjs')],text=True))
assert rooms['activeHumanRooms']==0, 'Active human rooms; retry at a quiet moment'
rollback=snapshot/'marketplace-rollback'; rollback.mkdir()
previous=[]; created=[]
paths=['apps/api/dist/'+name for name in meta['apiFiles']]+migration_paths
for name in paths:
    if (APP/name).exists(): copy_file(APP/name,rollback/name);previous.append(name)
    else: created.append(name)
old_next=snapshot/'marketplace-old-next';moved=False;migration_applied=False
try:
    subprocess.run(['systemctl','stop','dndnerds'],check=True)
    before_counts=count_rows()
    for name in migration_paths:copy_file(stage/name,APP/name)
    subprocess.run(['runuser','-u','dndnerds','--','node',str(APP/'apps/api/dist/db/migrate-production.js')],cwd=APP,check=True,timeout=120)
    observed_migration=pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations')
    migration_applied=int(observed_migration)>int(baseline_migration)
    assert observed_migration==target_migration and count_rows()==before_counts
    (APP/'apps/web/.next').rename(old_next);moved=True
    shutil.copytree(stage/'apps/web/.next',APP/'apps/web/.next')
    for source in (old_next/'static').rglob('*'):
        if source.is_file():
            target=APP/'apps/web/.next/static'/source.relative_to(old_next/'static')
            if not target.exists():copy_file(source,target)
    for name in meta['apiFiles']:copy_file(stage/'apps/api/dist'/name,APP/'apps/api/dist'/name)
    for p in (APP/'apps/web/.next').rglob('*'):p.chmod(0o755 if p.is_dir() else 0o644)
    (APP/'apps/web/.next').chmod(0o755)
    subprocess.run(['chown','-R','dndnerds:dndnerds',str(APP/'apps/web/.next')],check=True)
    subprocess.run(['systemctl','start','dndnerds'],check=True)
    for attempt in range(40):
        try:
            for url in ['http://127.0.0.1:4100/health/ready','http://127.0.0.1:4200/api/health','https://dndnerds.ir/store','https://dndnerds.ir/seller/marketplace','https://dndnerds.ir/play','https://dndnerds.ir/find-game','https://dndnerds.ir/find-dm','https://dndnerds.ir/vtt/']:get(url)
            assert 'کارگاه فروشگاه من' in get('https://dndnerds.ir/seller/marketplace').decode(), 'Seller portal was redirected or missing'
            get('https://dndnerds.ir/api/marketplace/v21/seller/apply',401,b'{}',{'Content-Type':'application/json','Origin':'https://dndnerds.ir'})
            get('https://dndnerds.ir/api/marketplace/v21/seller/apply',403,b'{}',{'Content-Type':'application/json','Origin':'https://untrusted.example'})
            gates=json.loads(get('http://127.0.0.1:4100/api/v1/marketplace/v21/readiness'));assert gates['livePayments'] is False and gates['livePayouts'] is False
            for path in meta.get('disabledMutationProbes',[]):get('http://127.0.0.1:4100'+path,503,b'{}',{'Content-Type':'application/json'})
            break
        except Exception:
            if attempt==39:raise
            time.sleep(2)
    assert preserved=={p:sha(p) for p in preserved}
    assert all(int(a)>=int(b) for a,b in zip(count_rows().split('|'),before_counts.split('|')))
    result.update({'released':True,'commit':meta['commit'],'webBuild':meta['webBuild'],'sha256':meta['sha256'],'backup':str(snapshot),'privateSettingsPreserved':True,'existingRowsPreserved':True})
    (snapshot/'marketplace-deployed.json').write_text(json.dumps(result));print(json.dumps(result),flush=True)
except BaseException:
    subprocess.run(['systemctl','stop','dndnerds'])
    if moved:
        restore_web(old_next,APP/'apps/web/.next',snapshot/'marketplace-failed-next')
    try:migration_applied=int(pg('SELECT max(created_at) FROM drizzle.__drizzle_migrations'))>int(baseline_migration)
    except Exception:
        # Keep the additive journal when commit status cannot be determined;
        # reverting it could cause a duplicate migration on recovery.
        migration_applied=True
    for name in previous:
        if name.startswith('apps/api/drizzle/') and migration_applied:continue
        copy_file(rollback/name,APP/name)
    # New code files may remain unused; additive schema and all user data remain intact.
    restarted=subprocess.run(['systemctl','start','dndnerds']).returncode==0
    restored=False
    if restarted:
        for attempt in range(20):
            try:
                get('http://127.0.0.1:4100/health/ready');get('https://dndnerds.ir/store');restored=True;break
            except Exception:time.sleep(2)
    print(json.dumps({'released':False,'runtimeRestored':restored,'backup':str(snapshot),'schemaRetained':migration_applied}),flush=True)
    raise
