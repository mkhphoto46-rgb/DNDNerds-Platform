"""Approved, no-restart Tadserver repair of the campaign image CHECK only."""
from pathlib import Path
import hashlib, json, os, subprocess, sys, time

assert sys.argv[1:] == ['--apply'], 'Explicit approved apply invocation required'
os.umask(0o077)
patch = Path('/opt/dndnerds/staging/campaign-cover-limit.sql')
assert hashlib.sha256(patch.read_bytes()).hexdigest() == '7cc34a4f4bb93298b06c86f962ffa7778827f7f06e0238be0e9ed9347ea017d8'
base = ['docker', 'exec', 'dnd-postgres', 'psql', '-U', 'dndnerds', '-d', 'dndnerds', '-At', '-v', 'ON_ERROR_STOP=1']

def query(text):
    return subprocess.check_output(base + ['-c', text], text=True).strip()

constraint_query = "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.game_tables'::regclass AND conname='game_tables_image_data_check'"
before = query(constraint_query)
assert '140000' in before or '700000' in before, 'Unexpected constraint; inspect before changing'
service_pid = subprocess.check_output(['systemctl', 'show', 'dndnerds', '-p', 'MainPID', '--value'], text=True).strip()
snapshot = Path('/opt/dndnerds/backups') / ('campaign-cover-before-' + time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()))
snapshot.mkdir(mode=0o700)
dump = snapshot / 'platform.dump'
with dump.open('xb') as stream:
    subprocess.run(['docker', 'exec', 'dnd-postgres', 'pg_dump', '-U', 'dndnerds', '-d', 'dndnerds', '--format=custom', '--no-owner', '--no-acl'], stdout=stream, check=True, timeout=120)
with dump.open('rb') as stream:
    subprocess.run(['docker', 'exec', '-i', 'dnd-postgres', 'pg_restore', '--list'], stdin=stream, stdout=subprocess.DEVNULL, check=True)
(snapshot / 'manifest.json').write_text(json.dumps({'sha256': hashlib.sha256(dump.read_bytes()).hexdigest(), 'previousConstraint': before, 'databaseBackupChecked': True}))
subprocess.run(['docker', 'exec', '-i', 'dnd-postgres', 'psql', '-U', 'dndnerds', '-d', 'dndnerds', '-v', 'ON_ERROR_STOP=1'], input=patch.read_bytes(), stdout=subprocess.DEVNULL, check=True, timeout=70)
assert '700000' in query(constraint_query)
# Temporary-table checks exercise the live CHECK without inserting a real table.
query("""BEGIN;
CREATE TEMP TABLE cover_limit_verify (LIKE public.game_tables INCLUDING DEFAULTS INCLUDING CONSTRAINTS) ON COMMIT DROP;
INSERT INTO cover_limit_verify(host_user_id,title,image_data) VALUES(gen_random_uuid(),'temporary cover verification','data:image/webp;base64,'||repeat('A',666668));
DO $$ BEGIN
 BEGIN
  INSERT INTO cover_limit_verify(host_user_id,title,image_data) VALUES(gen_random_uuid(),'temporary oversized verification',repeat('A',700001));
  RAISE EXCEPTION 'Oversized image incorrectly accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $$;
ROLLBACK;""")
assert subprocess.check_output(['systemctl', 'show', 'dndnerds', '-p', 'MainPID', '--value'], text=True).strip() == service_pid
subprocess.run(['systemctl', 'is-active', '--quiet', 'dndnerds'], check=True)
result = {'repaired': True, 'databaseBackupChecked': True, 'encodedLimit': 700000, 'binaryApiLimit': 500000, 'temporaryTableChecksPassed': True, 'serviceRestarted': False, 'realCampaignCreated': False}
(snapshot / 'repaired.json').write_text(json.dumps(result))
print(json.dumps(result), flush=True)
