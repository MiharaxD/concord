param([string]$InstallDirectory = '')
$ErrorActionPreference = 'Stop'
$appKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\8a86d3e6-9f7a-51f9-84ee-3c5f9108851b'
$registration = if (Test-Path -LiteralPath $appKey) { Get-ItemProperty -LiteralPath $appKey } else { $null }
$installation = Get-ItemProperty -LiteralPath 'HKCU:\Software\8a86d3e6-9f7a-51f9-84ee-3c5f9108851b' -ErrorAction SilentlyContinue
$shell = New-Object -ComObject WScript.Shell
function Read-Link([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    $link = $shell.CreateShortcut($path)
    return @{ Path = $path; Target = $link.TargetPath; Icon = $link.IconLocation }
}
$processes = @()
if ($InstallDirectory) {
    $prefix = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\') + '\'
    $processes = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { @{ Id = $_.ProcessId; Parent = $_.ParentProcessId; Name = $_.Name } })
}
@{
    Registration = if ($registration) { @{ Version = $registration.DisplayVersion; Name = $registration.DisplayName; Location = $installation.InstallLocation; DesktopChoice = $installation.DesktopShortcut; Uninstall = $registration.UninstallString; Key = $registration.PSPath } } else { $null }
    Desktop = Read-Link (Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Concord.lnk')
    StartMenu = Read-Link (Join-Path ([Environment]::GetFolderPath('Programs')) 'Concord.lnk')
    DefaultFolderExists = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Programs\Concord')
    Processes = $processes
    Administrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} | ConvertTo-Json -Depth 5 -Compress
