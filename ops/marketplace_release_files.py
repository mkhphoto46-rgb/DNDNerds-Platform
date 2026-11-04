import re

def validate_journal_upgrade(old, new, baseline, target):
    """Only append observed migrations. Never rewrite applied history or downgrade."""
    previous=old['entries']; current=new['entries']
    assert previous and current and len(current)>=len(previous)
    assert {k:v for k,v in old.items() if k!='entries'}=={k:v for k,v in new.items() if k!='entries'}
    assert current[:len(previous)]==previous, 'Applied migration history changed'
    assert str(previous[-1]['when'])==str(baseline), 'Live migration head differs from journal'
    assert str(current[-1]['when'])==str(target), 'Target migration head differs from journal'
    assert all(a['when']<b['when'] and a['idx']<b['idx'] for a,b in zip(current,current[1:]))
    assert all(re.fullmatch(r'\d{4}_[a-z0-9_]+',e['tag']) for e in current)
    return ['apps/api/drizzle/'+e['tag']+'.sql' for e in current[len(previous):]]

def restore_web(previous, current, failed):
    """Restore even if copying the replacement failed before creating its root."""
    assert previous.is_dir(), 'Previous web build is missing'
    assert not failed.exists(), 'Failed-build destination already exists'
    if current.exists(): current.rename(failed)
    previous.rename(current)
