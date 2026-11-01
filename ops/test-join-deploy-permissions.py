"""Exercise the actual deployment copier in a disposable Linux directory."""
from pathlib import Path
import ast, json, os, shutil, stat, subprocess, sys, tempfile

assert os.name=='posix', 'Linux file permission test must run on Linux'
source = Path(sys.argv[1]).read_text()
tree = ast.parse(source)
function = next(node for node in tree.body if isinstance(node,ast.FunctionDef) and node.name=='copy_public_file')
namespace = {'shutil':shutil}
exec(compile(ast.Module(body=[function],type_ignores=[]),'deployment-copier','exec'),namespace)
with tempfile.TemporaryDirectory(prefix='dnd-join-permission-') as folder:
    root=Path(folder); root.chmod(0o755)
    private=root/'private';private.mkdir(mode=0o700)
    file=private/'source.js';file.write_text('disposable fixture');file.chmod(0o600)
    public=root/'public';public.mkdir(mode=0o751)
    before=(stat.S_IMODE(public.stat().st_mode),public.stat().st_uid,public.stat().st_gid)
    target=public/'nested/file.js'
    previous=os.umask(0o077)
    try: namespace['copy_public_file'](file,target)
    finally: os.umask(previous)
    assert before==(stat.S_IMODE(public.stat().st_mode),public.stat().st_uid,public.stat().st_gid)
    assert stat.S_IMODE(target.parent.stat().st_mode)==0o755
    assert stat.S_IMODE(target.stat().st_mode)==0o644
    subprocess.run(['runuser','-u',sys.argv[2],'--','test','-r',str(target)],check=True)
print(json.dumps({'existingDirectoryMetadataPreserved':True,'newDirectoriesTraversable':True,'filesReadOnlyForOtherUsers':True,'runtimeUserCanRead':True}))
