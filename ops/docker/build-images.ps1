param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$taskRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $taskRoot
# Terminate only this CLI child on timeout; never restart the Engine here.
$info = [Diagnostics.ProcessStartInfo]::new('docker')
$info.ArgumentList.Add('info'); $info.ArgumentList.Add('--format'); $info.ArgumentList.Add('{{.OSType}}/{{.Architecture}}')
$info.UseShellExecute = $false; $info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true
$probe = [Diagnostics.Process]::Start($info)
if (-not $probe.WaitForExit(15000)) { $probe.Kill($true); throw 'Docker Engine did not answer in 15 seconds. Open Docker Desktop; no build was started.' }
if ($probe.ExitCode -ne 0) { throw 'Docker Engine unavailable. No build was started.' }
$engine = $probe.StandardOutput.ReadToEnd().Trim()
if ($engine -notmatch '^linux/(x86_64|amd64)$') { throw 'Linux amd64 Engine required for this release.' }
if ($CheckOnly) { Write-Output 'PASS: Linux amd64 Engine reachable'; exit 0 }
function Run([string]$Exe, [string[]]$Arguments) { & $Exe @Arguments; if ($LASTEXITCODE -ne 0) { throw "$Exe failed ($LASTEXITCODE)" } }
$dirty = git status --porcelain --untracked-files=no
if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Commit reviewed tracked changes before producing immutable images.' }
$release = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $release -notmatch '^[a-f0-9]{40}$') { throw 'Cannot determine source commit.' }
$folder = Join-Path $taskRoot ".deploy/docker/$release"
if (Test-Path -LiteralPath $folder) { throw 'Release output exists; keep it and use a new reviewed commit or inspect manually.' }
New-Item -ItemType Directory -Path $folder | Out-Null
$context = Join-Path $folder 'context'; New-Item -ItemType Directory -Path $context | Out-Null
Run -Exe git -Arguments @('archive', '-o', (Join-Path $folder 'source.tar'), $release)
Run -Exe tar -Arguments @('-xf', (Join-Path $folder 'source.tar'), '-C', $context)
foreach ($kind in @('api','web')) {
  Run -Exe docker -Arguments @('build', '--platform', 'linux/amd64', '--file', "$context/ops/docker/$kind.Dockerfile", '--label', "org.opencontainers.image.revision=$release", '--tag', "dndnerds-${kind}:$release", $context)
  Run -Exe docker -Arguments @('image', 'inspect', '--format', '{{.Os}}/{{.Architecture}} {{.Config.User}}', "dndnerds-${kind}:$release")
}
$archive = Join-Path $folder "dndnerds-$release.tar"
Run -Exe docker -Arguments @('image','save','-o',$archive,"dndnerds-web:$release","dndnerds-api:$release")
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant()
@{ commit=$release; platform='linux/amd64'; archive=(Split-Path $archive -Leaf); sha256=$hash } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $folder 'release.json') -Encoding utf8
Write-Output "Saved private local release in $folder. Test the isolated stack before transfer."
