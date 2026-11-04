param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$Release,
  [Parameter(Mandatory)][string]$RemoteDirectory,
  [string]$SshAlias='dndnerds-vps')
$ErrorActionPreference='Stop'
if ($SshAlias -notmatch '^[a-zA-Z0-9][a-zA-Z0-9.-]*$' -or $RemoteDirectory -notmatch '^/[a-zA-Z0-9/_-]+$') { throw 'Unsafe SSH alias or remote directory.' }
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$folder=Join-Path $taskRoot ".deploy/docker/$Release"
$meta=Get-Content -Raw -LiteralPath (Join-Path $folder 'release.json') | ConvertFrom-Json
$archive=Join-Path $folder "dndnerds-$Release.tar"
if ($meta.commit -ne $Release -or (Get-FileHash -Algorithm SHA256 -LiteralPath $archive).Hash.ToLowerInvariant() -ne $meta.sha256) { throw 'Release checksum mismatch.' }
& ssh -o StrictHostKeyChecking=yes $SshAlias "test -d '$RemoteDirectory' && test -w '$RemoteDirectory' && df -Pk '$RemoteDirectory'"
if ($LASTEXITCODE -ne 0) { throw 'Verified SSH access/target directory unavailable.' }
& scp -o StrictHostKeyChecking=yes $archive "${SshAlias}:$RemoteDirectory/"
if ($LASTEXITCODE -ne 0) { throw 'Transfer failed; no image loaded.' }
& ssh -o StrictHostKeyChecking=yes $SshAlias "echo '$($meta.sha256)  $RemoteDirectory/dndnerds-$Release.tar' | sha256sum -c -"
if ($LASTEXITCODE -ne 0) { throw 'Remote checksum mismatch; no image loaded.' }
Write-Output 'Transfer verified. Loading/staging is separate; no live routing changed.'
