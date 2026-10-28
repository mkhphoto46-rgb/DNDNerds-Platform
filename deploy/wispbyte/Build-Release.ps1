param(
  [string]$Image = 'node:24-bookworm-slim'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$work = Join-Path $projectRoot '.deploy\wispbyte'
$source = Join-Path $work 'source'
$release = Join-Path $work 'release'

if (Test-Path -LiteralPath $work) {
  $resolved = [IO.Path]::GetFullPath($work)
  $expected = [IO.Path]::GetFullPath((Join-Path $projectRoot '.deploy\wispbyte'))
  if ($resolved -ne $expected) { throw "Unsafe work directory: $resolved" }
  foreach ($generated in @('source', 'release')) {
    $target = [IO.Path]::GetFullPath((Join-Path $work $generated))
    if (-not $target.StartsWith($resolved + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe generated directory: $target"
    }
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
  }
}

New-Item -ItemType Directory -Path $source, $release -Force | Out-Null
Copy-Item (Join-Path $projectRoot 'package.json') $source
Copy-Item (Join-Path $projectRoot 'package-lock.json') $source

foreach ($relative in @('apps/web', 'apps/api')) {
  $target = Join-Path $source $relative
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  $files = if ($relative -eq 'apps/web') {
    @('package.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json')
  } else {
    @('package.json', 'package-lock.json', 'tsconfig.json')
  }
  foreach ($name in $files) { Copy-Item (Join-Path $projectRoot "$relative/$name") $target }
  Copy-Item (Join-Path $projectRoot "$relative/src") $target -Recurse
  if ($relative -eq 'apps/api') { Copy-Item (Join-Path $projectRoot "$relative/drizzle") $target -Recurse }
  if ($relative -eq 'apps/web') { Copy-Item (Join-Path $projectRoot "$relative/public") $target -Recurse }
}

$vttRoot = Join-Path (Split-Path $projectRoot -Parent) 'DND WEB VTT'
if (-not (Test-Path -LiteralPath (Join-Path $vttRoot 'server/server.ts'))) { throw "VTT source not found at $vttRoot" }
$vttSource = Join-Path $source 'apps/vtt'
New-Item -ItemType Directory -Path $vttSource -Force | Out-Null
foreach ($name in @('package.json', 'package-lock.json', 'vite.config.ts', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.server.json')) {
  Copy-Item (Join-Path $vttRoot $name) $vttSource
}
foreach ($name in @('src', 'server', 'public')) { Copy-Item (Join-Path $vttRoot $name) $vttSource -Recurse }

$mount = "$($source.Replace('\', '/')):/work"
docker run --rm -v $mount -w /work $Image sh -lc 'npm ci --no-audit --no-fund && cd apps/api && npm ci --no-audit --no-fund && cd /work && npm run build:web && npm run build:api && cd apps/api && npm prune --omit=dev --no-audit --no-fund && cd /work/apps/vtt && npm ci --no-audit --no-fund && VTT_BASE_PATH=/vtt npm run build && ./node_modules/.bin/esbuild server/server.ts --bundle --platform=node --format=esm --packages=external --outfile=server/server.mjs --target=node24 && npm prune --omit=dev --no-audit --no-fund'
if ($LASTEXITCODE -ne 0) { throw 'Linux build failed' }

Copy-Item (Join-Path $source 'apps/web/.next/standalone/*') $release -Recurse -Force
$webRelease = Join-Path $release 'apps/web'
New-Item -ItemType Directory -Path (Join-Path $webRelease '.next') -Force | Out-Null
Copy-Item (Join-Path $source 'apps/web/.next/static') (Join-Path $webRelease '.next') -Recurse
Copy-Item (Join-Path $source 'apps/web/public') $webRelease -Recurse
$apiRelease = Join-Path $release 'apps/api'
New-Item -ItemType Directory -Path $apiRelease -Force | Out-Null
foreach ($name in @('dist', 'drizzle', 'node_modules', 'package.json')) {
  Copy-Item (Join-Path $source "apps/api/$name") $apiRelease -Recurse
}
Copy-Item (Join-Path $PSScriptRoot 'index.js') (Join-Path $release 'index.js')
Copy-Item (Join-Path $PSScriptRoot 'proxy.cjs') (Join-Path $release 'proxy.cjs')

$vttRelease = Join-Path $release 'apps/vtt'
New-Item -ItemType Directory -Path (Join-Path $vttRelease 'server') -Force | Out-Null
Copy-Item (Join-Path $vttSource 'dist') $vttRelease -Recurse
Copy-Item (Join-Path $vttSource 'node_modules') $vttRelease -Recurse
Copy-Item (Join-Path $vttSource 'package.json') $vttRelease
Copy-Item (Join-Path $vttSource 'server/server.mjs') (Join-Path $vttRelease 'server/server.mjs')

docker run --rm -v "$($work.Replace('\', '/')):/work" -w /work $Image sh -lc 'tar --exclude=./apps/web/public --exclude=./apps/vtt -czf dnd-nerds-core.tar.gz -C release . && tar -czf dnd-nerds-art.tar.gz -C release ./apps/web/public/town-images ./apps/web/public/town-models ./apps/web/public/brand && tar -czf dnd-nerds-media.tar.gz -C release ./apps/web/public/audio ./apps/web/public/town-scenes ./apps/web/public/town-textures && tar --exclude=./apps/vtt/node_modules -czf dnd-nerds-vtt-app.tar.gz -C release ./apps/vtt && tar -czf dnd-nerds-vtt-deps.tar.gz -C release ./apps/vtt/node_modules'
if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }

foreach ($name in @('dnd-nerds-core.tar.gz', 'dnd-nerds-art.tar.gz', 'dnd-nerds-media.tar.gz', 'dnd-nerds-vtt-app.tar.gz', 'dnd-nerds-vtt-deps.tar.gz')) {
  $archive = Join-Path $work $name
  $size = (Get-Item $archive).Length
  if ($size -ge 100MB) { throw "$name exceeds Wispbyte's 100 MiB upload limit" }
  Write-Host "Release: $archive ($([math]::Round($size / 1MB, 1)) MiB)"
}
