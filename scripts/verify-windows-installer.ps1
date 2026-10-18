[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ExpectedInstallerSha256,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-fA-F0-9]{64}$')]
  [string]$ExpectedApplicationSha256,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$')]
  [string]$ExpectedVersion
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Never run this installer test in a developer's account or on a persistent runner.
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted') {
  throw 'Installer verification requires a disposable GitHub-hosted Windows Actions runner.'
}
if (-not $env:RUNNER_TEMP -or $env:RUNNER_TEMP -notmatch '^[A-Za-z]:[\\/]') {
  throw 'RUNNER_TEMP must be an existing absolute local Windows directory.'
}
$runnerDirectory = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\', '/')
if (-not (Test-Path -LiteralPath $runnerDirectory -PathType Container) -or
    $runnerDirectory.Length -le 3 -or
    ((Get-Item -LiteralPath $runnerDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'RUNNER_TEMP must be an existing non-root directory without a reparse point.'
}
$verificationDirectory = [IO.Path]::GetFullPath((Join-Path $runnerDirectory 'gitsomething-installer-verification'))
$installDirectory = [IO.Path]::GetFullPath((Join-Path $verificationDirectory 'install'))
if (-not $verificationDirectory.StartsWith($runnerDirectory + '\', [StringComparison]::OrdinalIgnoreCase) -or
    -not $installDirectory.StartsWith($verificationDirectory + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Verification paths must remain inside the owned runner directory.'
}
if (Test-Path -LiteralPath $verificationDirectory) {
  $existingDirectory = Get-Item -LiteralPath $verificationDirectory
  if (-not $existingDirectory.PSIsContainer -or
      ($existingDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'The verification directory must be an ordinary directory.'
  }
} else {
  New-Item -ItemType Directory -Path $verificationDirectory | Out-Null
}
$reportPath = Join-Path $verificationDirectory 'report.json'
if ((Test-Path -LiteralPath $reportPath) -and
    ((Get-Item -LiteralPath $reportPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'The verification report must not be a reparse point.'
}

$report = [ordered]@{
  status = 'failed'
  version = $ExpectedVersion
  runtime = 'github-hosted-windows'
  installer = [ordered]@{ sha256 = ''; bytes = 0; signatureStatus = '' }
  application = [ordered]@{ sha256 = ''; bytes = 0; architecture = ''; signatureStatus = '' }
  checks = [Collections.Generic.List[string]]::new()
  state = [ordered]@{}
  failure = 'Verification did not complete.'
}
$currentCheck = 'initialize verification'

function Save-Report {
  # No usernames, resolved paths, registry contents, or provider credentials.
  [IO.File]::WriteAllText($reportPath, ($report | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}

function Confirm-Check([bool]$Condition, [string]$Name) {
  $script:currentCheck = $Name
  if (-not $Condition) { throw 'An installer verification check failed.' }
  $report.checks.Add($Name)
}

function Test-SamePath([string]$ActualPath, [string]$ExpectedPath) {
  if ([string]::IsNullOrWhiteSpace($ActualPath)) { return $false }
  try {
    $actual = [IO.Path]::GetFullPath($ActualPath.Trim('"')).TrimEnd('\', '/')
    $expected = [IO.Path]::GetFullPath($ExpectedPath).TrimEnd('\', '/')
    return [string]::Equals($actual, $expected, [StringComparison]::OrdinalIgnoreCase)
  } catch { return $false }
}

function Get-ExecutableArchitecture([string]$FilePath) {
  $stream = [IO.File]::OpenRead($FilePath)
  $reader = [IO.BinaryReader]::new($stream)
  try {
    if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5a4d) {
      throw 'Invalid executable header.'
    }
    $stream.Position = 0x3c
    $header = $reader.ReadUInt32()
    if ($header -gt $stream.Length - 24) { throw 'Invalid executable header.' }
    $stream.Position = $header
    if ($reader.ReadUInt32() -ne 0x00004550) { throw 'Invalid executable header.' }
    switch ($reader.ReadUInt16()) {
      0x8664 { return 'x86_64' }
      0x014c { return 'x86' }
      0xaa64 { return 'arm64' }
      default { return 'unknown' }
    }
  } finally {
    $reader.Dispose()
    $stream.Dispose()
  }
}

Save-Report
try {
  $currentCheck = 'read setup candidate'
  $installer = Get-Item -LiteralPath $InstallerPath
  Confirm-Check (-not $installer.PSIsContainer -and $installer.Extension -ieq '.exe') 'setup candidate is an executable file'
  $installerHash = (Get-FileHash -LiteralPath $installer.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $report.installer.sha256 = $installerHash
  $report.installer.bytes = $installer.Length
  Confirm-Check ($installerHash -ceq $ExpectedInstallerSha256.ToLowerInvariant()) 'setup hash matches expected candidate'
  $currentCheck = 'inspect setup metadata'
  $report.installer.signatureStatus = [string](Get-AuthenticodeSignature -LiteralPath $installer.FullName).Status
  Confirm-Check (@('NotSigned', 'Valid') -contains $report.installer.signatureStatus) 'setup signature is unsigned or valid'
  Confirm-Check ($installer.VersionInfo.ProductVersion -ceq $ExpectedVersion) 'setup product version matches expected version'

  $uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\GitSomething'
  $productKey = 'HKCU:\Software\GitSomething\GitSomething'
  $desktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'GitSomething.lnk'
  $startMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'GitSomething.lnk'
  $nestedMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'GitSomething\GitSomething.lnk'
  $defaultInstallDirectory = Join-Path $env:LOCALAPPDATA 'GitSomething'
  $roamingDataDirectory = Join-Path $env:APPDATA 'dev.branchline.desktop'
  $localDataDirectory = Join-Path $env:LOCALAPPDATA 'dev.branchline.desktop'
  $report.state.freshUninstallRegistration = -not (Test-Path -LiteralPath $uninstallKey)
  $report.state.freshProductRegistration = -not (Test-Path -LiteralPath $productKey)
  $report.state.freshDesktopShortcut = -not (Test-Path -LiteralPath $desktopLink)
  $report.state.freshStartMenuShortcut = -not (Test-Path -LiteralPath $startMenuLink)
  $report.state.freshNestedStartMenuShortcut = -not (Test-Path -LiteralPath $nestedMenuLink)
  $report.state.freshOwnedInstallDirectory = -not (Test-Path -LiteralPath $installDirectory)
  $report.state.freshDefaultInstallDirectory = -not (Test-Path -LiteralPath $defaultInstallDirectory)
  $report.state.freshRoamingAppData = -not (Test-Path -LiteralPath $roamingDataDirectory)
  $report.state.freshLocalAppData = -not (Test-Path -LiteralPath $localDataDirectory)
  Confirm-Check (-not ($report.state.Values -contains $false)) 'runner has no existing GitSomething installation shortcuts or app data'

  $currentCheck = 'run silent installer'
  # NSIS /D must be last, without enclosing quotes, including for paths with spaces.
  # /R is deliberately absent: the installed application must never be launched.
  $installProcess = Start-Process -FilePath $installer.FullName -ArgumentList "/S /D=$installDirectory" -Wait -PassThru -WindowStyle Hidden
  $report.state.installerExitCode = $installProcess.ExitCode
  Confirm-Check ($installProcess.ExitCode -eq 0) 'silent installer exited successfully'
  $applicationPath = Join-Path $installDirectory 'gitsomething.exe'
  $uninstallerPath = Join-Path $installDirectory 'uninstall.exe'
  Confirm-Check (Test-Path -LiteralPath $applicationPath -PathType Leaf) 'installed application exists in owned directory'
  Confirm-Check (Test-Path -LiteralPath $uninstallerPath -PathType Leaf) 'installed uninstaller exists in owned directory'
  $currentCheck = 'inspect installed application'
  $application = Get-Item -LiteralPath $applicationPath
  $report.application.sha256 = (Get-FileHash -LiteralPath $applicationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $report.application.bytes = $application.Length
  $report.application.architecture = Get-ExecutableArchitecture $applicationPath
  $report.application.signatureStatus = [string](Get-AuthenticodeSignature -LiteralPath $applicationPath).Status
  Confirm-Check ($report.application.sha256 -ceq $ExpectedApplicationSha256.ToLowerInvariant()) 'installed payload hash matches audited application'
  Confirm-Check ($report.application.architecture -ceq 'x86_64') 'installed application architecture is x86_64'
  Confirm-Check ($application.VersionInfo.ProductVersion -ceq $ExpectedVersion) 'installed application product version matches expected version'
  Confirm-Check (@('NotSigned', 'Valid') -contains $report.application.signatureStatus) 'installed application signature is unsigned or valid'

  Confirm-Check ((Test-Path -LiteralPath $uninstallKey) -and (Test-Path -LiteralPath $productKey)) 'current-user install and uninstall registrations exist'
  $currentCheck = 'inspect current-user registration'
  $registration = Get-ItemProperty -LiteralPath $uninstallKey
  Confirm-Check ($registration.DisplayVersion -ceq $ExpectedVersion) 'registered version matches expected version'
  Confirm-Check ($registration.DisplayName -ceq 'GitSomething' -and $registration.Publisher -ceq 'GitSomething') 'registered product and publisher match GitSomething'
  Confirm-Check (Test-SamePath $registration.InstallLocation $installDirectory) 'registered installation targets owned directory'
  Confirm-Check ($registration.UninstallString -ceq ('"' + $uninstallerPath + '"')) 'registered uninstaller targets owned uninstaller'
  $product = Get-Item -LiteralPath $productKey
  try {
    Confirm-Check (Test-SamePath ([string]$product.GetValue('')) $installDirectory) 'remembered installation targets owned directory'
  } finally { $product.Close() }

  Confirm-Check ((Test-Path -LiteralPath $desktopLink -PathType Leaf) -and (Test-Path -LiteralPath $startMenuLink -PathType Leaf)) 'desktop and Start menu shortcuts exist'
  $currentCheck = 'inspect shortcut targets'
  $shell = New-Object -ComObject WScript.Shell
  $desktopShortcut = $null
  $startMenuShortcut = $null
  try {
    $desktopShortcut = $shell.CreateShortcut($desktopLink)
    $startMenuShortcut = $shell.CreateShortcut($startMenuLink)
    Confirm-Check (Test-SamePath $desktopShortcut.TargetPath $applicationPath) 'desktop shortcut targets installed application'
    Confirm-Check (Test-SamePath $startMenuShortcut.TargetPath $applicationPath) 'Start menu shortcut targets installed application'
    Confirm-Check ([string]::IsNullOrEmpty($desktopShortcut.Arguments) -and [string]::IsNullOrEmpty($startMenuShortcut.Arguments)) 'shortcuts contain no unexpected launch arguments'
  } finally {
    if ($null -ne $desktopShortcut) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($desktopShortcut) }
    if ($null -ne $startMenuShortcut) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($startMenuShortcut) }
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
  }
  Confirm-Check (-not (Get-Process -Name gitsomething -ErrorAction SilentlyContinue)) 'silent installation did not launch application'

  $currentCheck = 'run owned silent uninstaller'
  # No app-data-delete option. Default NSIS silently preserves application data.
  # Do not use _?= (it disables normal uninstaller self-copy and self-removal).
  $uninstallProcess = Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
  $report.state.uninstallerExitCode = $uninstallProcess.ExitCode
  Confirm-Check ($uninstallProcess.ExitCode -eq 0) 'silent uninstaller exited successfully'
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $removed = -not ((Test-Path -LiteralPath $installDirectory) -or
      (Test-Path -LiteralPath $uninstallKey) -or
      (Test-Path -LiteralPath $desktopLink) -or
      (Test-Path -LiteralPath $startMenuLink))
    if ($removed) { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  Confirm-Check (-not (Test-Path -LiteralPath $installDirectory)) 'uninstaller removed owned installation directory and application'
  Confirm-Check (-not (Test-Path -LiteralPath $uninstallKey)) 'uninstaller removed current-user uninstall registration'
  Confirm-Check (-not ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $startMenuLink))) 'uninstaller removed owned desktop and Start menu shortcuts'
  Confirm-Check (-not ((Test-Path -LiteralPath $roamingDataDirectory) -or (Test-Path -LiteralPath $localDataDirectory))) 'application profile directories remain absent'

  # NSIS intentionally keeps the remembered install path by default. Remove only
  # the exact key created by this fresh test, after proving its value and subtree.
  $currentCheck = 'remove only owned remembered installation registration'
  if (Test-Path -LiteralPath $productKey) {
    $remainingProduct = Get-Item -LiteralPath $productKey
    Confirm-Check (Test-SamePath ([string]$remainingProduct.GetValue('')) $installDirectory) 'remaining remembered path belongs to owned test installation'
    Confirm-Check (@($remainingProduct.GetSubKeyNames()).Count -eq 0) 'owned product registration has no unexpected child keys'
    Confirm-Check (@($remainingProduct.GetValueNames() | Where-Object { $_ -notin @('', 'Installer Language') }).Count -eq 0) 'owned product registration has no unexpected values'
    $remainingProduct.Close()
    Remove-Item -LiteralPath $productKey
  }
  Confirm-Check (-not (Test-Path -LiteralPath $productKey)) 'owned product registration removed after uninstall'
  Confirm-Check (-not (Test-Path -LiteralPath $defaultInstallDirectory)) 'default installation directory remains untouched'
  $report.status = 'passed'
  $report.failure = $null
  Save-Report
  Write-Output 'Installer verification passed: payload, version, registry, both shortcuts, and uninstall.'
} catch {
  # Preserve failed installation evidence in this disposable runner. Never perform
  # recursive cleanup or run an uninstaller after a failed ownership/hash check.
  $report.status = 'failed'
  $report.failure = $currentCheck
  Save-Report
  Write-Error ('Installer verification failed at check: ' + $currentCheck) -ErrorAction Continue
  exit 1
}
