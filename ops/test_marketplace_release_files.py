import tempfile, unittest
from pathlib import Path
from ops.marketplace_release_files import restore_web

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

if __name__=='__main__': unittest.main()
