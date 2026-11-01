param([Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$Release)
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location -LiteralPath $taskRoot
$env:RELEASE_TAG=$Release
$compose=Join-Path $PSScriptRoot 'compose.test.yml'
function Compose([string[]]$Arguments) {
  & docker compose -f $compose @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Isolated Compose step failed; its volumes were preserved.' }
}
Compose -Arguments @('config','--quiet')
Compose -Arguments @('up','-d','--wait','postgres','redis')
# This migration targets ONLY the hardcoded disposable test database.
Compose -Arguments @('--profile','migration-test','run','--rm','migrate')
Compose -Arguments @('up','-d','api','web')
function Wait-Ready {
$ready=$false
for ($attempt=0; $attempt -lt 30; $attempt++) {
  try {
    foreach ($url in @('http://localhost:24100/ready','http://localhost:23100/login','http://localhost:23100/register','http://localhost:23100/verify-email')) {
      $response=Invoke-WebRequest -Uri $url -TimeoutSec 3
      if ($response.StatusCode -ne 200) {throw 'Unexpected status'}
    }
    $ready=$true; break
  } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) {throw 'Readiness failed; isolated containers and data retained for diagnosis.'}
}
Wait-Ready
Compose -Arguments @('restart','api','web')
Wait-Ready
Write-Output 'Route checks passed before and after app restart. Verify database persistence/auth and image contents before recording release acceptance. Test volumes were retained.'
