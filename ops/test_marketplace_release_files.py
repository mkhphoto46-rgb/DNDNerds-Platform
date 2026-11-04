import tempfile, unittest
from pathlib import Path
from ops.marketplace_release_files import restore_web, validate_journal_upgrade

class RollbackTests(unittest.TestCase):
    def exercise(self, partial):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory).resolve()
            previous=root/'previous';current=root/'.next';failed=root/'failed'
            for path in [previous,current,failed]: assert path.resolve().parent==root
            previous.mkdir();(previous/'BUILD_ID').write_text('known-good')
            if partial: current.mkdir();(current/'incomplete').write_text('partial-copy')
            restore_web(previous,current,failed)
            self.assertEqual((current/'BUILD_ID').read_text(),'known-good')
            self.assertEqual(failed.exists(),partial)
    def test_restore_when_copy_never_created_target(self): self.exercise(False)
    def test_restore_after_partial_copy(self): self.exercise(True)

class JournalTests(unittest.TestCase):
    def journal(self, count):
        return {'version':'7','dialect':'postgresql','entries':[
            {'idx':n,'when':100+n,'tag':f'{n:04d}_safe','version':'7','breakpoints':True} for n in range(count)]}
    def test_multiple_additive_migrations(self):
        self.assertEqual(validate_journal_upgrade(self.journal(2),self.journal(5),'101','104'),
            ['apps/api/drizzle/0002_safe.sql','apps/api/drizzle/0003_safe.sql','apps/api/drizzle/0004_safe.sql'])
    def test_same_head_has_no_pending_migration(self):
        self.assertEqual(validate_journal_upgrade(self.journal(2),self.journal(2),'101','101'),[])
    def test_refuses_rewrite_downgrade_and_wrong_live_head(self):
        old=self.journal(2);changed=self.journal(3);changed['entries'][0]['tag']='0000_rewritten'
        for new,before,target in [(changed,'101','102'),(self.journal(1),'101','100'),(self.journal(3),'999','102')]:
            with self.assertRaises(AssertionError):validate_journal_upgrade(old,new,before,target)

if __name__=='__main__': unittest.main()
