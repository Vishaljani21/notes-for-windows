param([Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version)
$ErrorActionPreference = 'Stop'
$notesProject = Split-Path -Parent $PSScriptRoot
$notesSetup = Join-Path $notesProject ("release\Notes-for-Windows-Setup-$Version.exe")
$notesInstallDir = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Programs\Notes for Windows'
$notesInstalledExe = Join-Path $notesInstallDir 'Notes for Windows.exe'
$notesWorkspaceExe = Join-Path $notesProject 'release\win-unpacked\Notes for Windows.exe'
if (-not (Test-Path -LiteralPath $notesSetup)) { throw 'The requested installer is missing.' }
$notesInstalledProcesses = @(Get-Process 'Notes for Windows' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $notesInstalledExe })
if ($notesInstalledProcesses.Count -gt 0 -and (Test-Path -LiteralPath $notesInstalledExe)) {
  $notesExistingVersion = [version]((Get-Item -LiteralPath $notesInstalledExe).VersionInfo.ProductVersion.Split('+')[0])
  if ($notesExistingVersion -ge [version]'1.1.0') {
    $notesQuitRequest = Start-Process -FilePath $notesInstalledExe -ArgumentList '--quit' -WindowStyle Hidden -PassThru
    if (-not $notesQuitRequest.WaitForExit(10000)) { throw 'Notes did not accept the quit request. The update has not started.' }
    foreach ($notesExistingProcess in $notesInstalledProcesses) {
      if (-not $notesExistingProcess.WaitForExit(20000)) { throw 'Notes is still saving or waiting to quit. The update has not started.' }
    }
  }
}
$notesWindows = Get-Process 'Notes for Windows' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.Path -eq $notesInstalledExe -or $_.Path -eq $notesWorkspaceExe) }
foreach ($notesWindow in $notesWindows) {
  if (-not $notesWindow.CloseMainWindow()) { throw 'Notes could not close gracefully. The update has not started.' }
  if (-not $notesWindow.WaitForExit(15000)) { throw 'Notes is still saving or waiting to close. The update has not started.' }
}
$notesInstallerProcess = Start-Process -FilePath $notesSetup -ArgumentList @('/S', '/currentuser', ('/D=' + $notesInstallDir)) -WindowStyle Hidden -Wait -PassThru
if ($notesInstallerProcess.ExitCode -ne 0) { throw "The installer returned exit code $($notesInstallerProcess.ExitCode)." }
$notesFileVersion = (Get-Item -LiteralPath $notesInstalledExe).VersionInfo.ProductVersion
if ($notesFileVersion -notlike "$Version*") { throw "The installed version is $notesFileVersion rather than $Version." }
$notesLinkShell = New-Object -ComObject WScript.Shell
$notesDesktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Notes for Windows.lnk'
$notesStartLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'Notes for Windows.lnk'
foreach ($notesLinkPath in @($notesDesktopLink, $notesStartLink)) {
  $notesLink = $notesLinkShell.CreateShortcut($notesLinkPath)
  $notesLink.TargetPath = $notesInstalledExe
  $notesLink.WorkingDirectory = $notesInstallDir
  $notesLink.IconLocation = $notesInstalledExe + ',0'
  $notesLink.Description = 'Open Notes for Windows'
  $notesLink.WindowStyle = 1
  if ($notesLinkPath -eq $notesDesktopLink) { $notesLink.Hotkey = 'CTRL+ALT+N' }
  $notesLink.Save()
}
$notesNewProcess = Start-Process -FilePath $notesInstalledExe -WorkingDirectory $notesInstallDir -PassThru
Start-Sleep -Seconds 2
$notesNewProcess.Refresh()
if ($notesNewProcess.HasExited) { throw "Notes exited during startup with code $($notesNewProcess.ExitCode)." }
[PSCustomObject]@{Version=$notesFileVersion;InstalledApp=$notesInstalledExe;Window=$notesNewProcess.MainWindowTitle;ProcessId=$notesNewProcess.Id;KeyboardShortcut=$notesLinkShell.CreateShortcut($notesDesktopLink).Hotkey} | Format-List
