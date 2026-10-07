$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$compilerPath = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compilerPath)) { throw 'Compilador .NET Framework 4 nao encontrado no Windows.' }
$runtimeDirectory = Join-Path $projectDirectory '.runtime'
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
& $compilerPath /nologo /optimize+ /platform:x64 /target:exe "/out:$runtimeDirectory\ConcordAudio.exe" (Join-Path $projectDirectory 'native\AppAudio.cs')
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar o capturador de audio.' }
Write-Host 'ConcordAudio compilado a partir do codigo-fonte local.'
