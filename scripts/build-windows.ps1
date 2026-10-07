param([ValidateSet('installer', 'portable')][string]$Target = 'installer', [switch]$Publish)
$ErrorActionPreference = 'Stop'
$projectDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Invoke-BuildStep([string]$label, [string]$command, [string[]]$arguments) {
    Write-Host $label
    & $command @arguments
    if ($LASTEXITCODE -ne 0) { throw "Falha nesta etapa: $label (codigo $LASTEXITCODE)." }
}

try {
    Push-Location -LiteralPath $projectDirectory
    $nodeCommand = (Get-Command node -CommandType Application -ErrorAction Stop).Source
    $nodeMajor = [int]((& $nodeCommand --version).Trim().TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 22) { throw 'Para gerar o programa, instale Node.js 22 ou mais recente.' }
    $pnpmCommand = (Get-Command pnpm -CommandType Application -ErrorAction Stop).Source
    $env:PATH = (Split-Path -Parent $nodeCommand) + ';' + $env:PATH
    $package = Get-Content -LiteralPath (Join-Path $projectDirectory 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($package.version -notmatch '^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$') { throw 'Versao invalida no package.json.' }
    if ($Publish) {
        if ($Target -ne 'installer') { throw 'Publicacao automatica usa somente o instalador NSIS.' }
        if ($package.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Este canal publica somente versoes estaveis MAJOR.MINOR.PATCH.' }
        if (-not ($env:GH_TOKEN -or $env:GITHUB_TOKEN)) { throw 'Defina GH_TOKEN somente no ambiente de desenvolvimento/CI para publicar a release.' }
    }

    Invoke-BuildStep 'Preparando as ferramentas de desenvolvimento...' $pnpmCommand @('install', '--frozen-lockfile')
    Invoke-BuildStep 'Conferindo e preparando o componente de conexao...' $nodeCommand @('scripts/prepare.mjs')
    Invoke-BuildStep 'Compilando o capturador de audio...' 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/build-audio.ps1')

    $config = if ($Target -eq 'installer') { 'build/installer.cjs' } else { 'build/electron-builder.cjs' }
    $builderTarget = if ($Target -eq 'installer') { 'nsis' } else { 'portable' }
    $outputRelative = if ($Target -eq 'installer') { "dist/installer/$($package.version)" } else { "dist/$($package.version)" }
    $outputDirectory = [IO.Path]::GetFullPath((Join-Path $projectDirectory $outputRelative))
    $stagingDirectory = [IO.Path]::GetFullPath((Join-Path $outputDirectory 'win-unpacked'))
    $distPrefix = [IO.Path]::GetFullPath((Join-Path $projectDirectory 'dist')) + [IO.Path]::DirectorySeparatorChar
    if (-not $stagingDirectory.StartsWith($distPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Pasta temporaria fora de dist. Build cancelado.' }
    $ancestorDirectory = $stagingDirectory
    while ($ancestorDirectory -and $ancestorDirectory.StartsWith($projectDirectory, [StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $ancestorDirectory) {
            if ((Get-Item -LiteralPath $ancestorDirectory -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Link encontrado no caminho da pasta temporaria. Limpeza automatica cancelada.' }
        }
        if ($ancestorDirectory -eq $projectDirectory) { break }
        $ancestorDirectory = Split-Path -Parent $ancestorDirectory
    }
    if (Test-Path -LiteralPath $stagingDirectory) {
        $links = @(Get-Item -LiteralPath $stagingDirectory) + @(Get-ChildItem -LiteralPath $stagingDirectory -Force -Recurse)
        if ($links | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Link encontrado na pasta temporaria. Limpeza automatica cancelada.' }
        Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    }

    # Recreate only staging for this version. Earlier releases and user data stay outside it.
    Invoke-BuildStep 'Gerando o pacote Windows...' $pnpmCommand @('exec', 'electron-builder', '--config', $config, '--win', $builderTarget, '--x64', '--publish', 'never')
    $filename = if ($Target -eq 'installer') { "Concord-$($package.version)-Setup.exe" } else { "Concord-$($package.version)-Windows.exe" }
    $artifactPath = Join-Path $outputDirectory $filename
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw 'O empacotador nao gerou o executavel esperado.' }
    $hash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText($artifactPath + '.sha256', "$hash *$filename`r`n", [Text.Encoding]::ASCII)
    if ($Target -eq 'installer') {
        foreach ($required in @('latest.yml', "$filename.blockmap")) {
            if (-not (Test-Path -LiteralPath (Join-Path $outputDirectory $required) -PathType Leaf)) { throw "Metadado de atualizacao ausente: $required" }
        }
    }
    if ($Publish) { Invoke-BuildStep 'Publicando o instalador e os metadados no GitHub...' $nodeCommand @('scripts/publish-release.mjs') }
    Write-Host "Pronto para enviar: $artifactPath"
    exit 0
} catch {
    Write-Host "Nao consegui gerar o pacote: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Ferramentas necessarias apenas no PC de desenvolvimento: Node.js 22+ e pnpm 11.19.0. Veja BUILD_WINDOWS.md.'
    exit 1
} finally { Pop-Location }
