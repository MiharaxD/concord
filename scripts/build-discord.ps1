$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$sdkDirectory = Join-Path $projectDirectory 'vendor\discord-social-sdk'
$runtimeDirectory = Join-Path $projectDirectory '.runtime'
$manifest = Get-Content (Join-Path $sdkDirectory 'version.json') -Raw | ConvertFrom-Json
$binary = Join-Path $sdkDirectory 'discord_partner_sdk.dll'
$sha = [Security.Cryptography.SHA256]::Create(); $stream = [IO.File]::OpenRead($binary)
try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
finally { $stream.Dispose(); $sha.Dispose() }
if ($hash -ne $manifest.sha256) { throw 'Checksum do Discord Social SDK divergente.' }
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
Copy-Item -LiteralPath $binary -Destination (Join-Path $runtimeDirectory 'discord_partner_sdk.dll')
Copy-Item -LiteralPath (Join-Path $sdkDirectory 'License-Notices.txt') -Destination (Join-Path $runtimeDirectory 'discord-sdk-LICENSE.txt')
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compilerPath /nologo /optimize+ /platform:x64 /target:exe /r:System.Web.Extensions.dll "/out:$runtimeDirectory\ConcordDiscord.exe" (Join-Path $projectDirectory 'native\DiscordSocial.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o componente do Discord.' }
& (Join-Path $runtimeDirectory 'ConcordDiscord.exe') --probe
if ($LASTEXITCODE -ne 0) { throw 'O componente do Discord não iniciou com o SDK.' }
