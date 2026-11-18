<# : Abharanam - set up direct tag printing (double-click this file)
@echo off
title Abharanam - direct tag printing setup
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([IO.File]::ReadAllText('%~f0'))"
echo.
pause
exit /b
#>

# Sets the tag printer as the Windows default printer and makes a desktop shortcut
# "Print tags directly" that opens the shop software in Edge (or Chrome) with kiosk printing,
# so tags print straight away with no print window. Run it again any time; it only repeats the same steps.

$ErrorActionPreference = 'Stop'
$site = 'https://1gram.abharanamcollections.com/shop-admin/tags'

Write-Host ''
Write-Host '  Abharanam - direct tag printing setup' -ForegroundColor Yellow
Write-Host ''

# 1. Find the tag printer (Xprinter / XP-420B, or any name with "label" or "tag").
$printers = @(Get-CimInstance Win32_Printer | Sort-Object Name)
$tag = $printers | Where-Object { $_.Name -match 'xprinter|xp-?420|label|tag' } | Select-Object -First 1
if (-not $tag) {
  Write-Host '  Could not find the tag printer by name. Printers on this computer:'
  for ($i = 0; $i -lt $printers.Count; $i++) { Write-Host ("   {0}. {1}" -f ($i + 1), $printers[$i].Name) }
  $pick = Read-Host '  Type the number of the tag printer and press Enter'
  $tag = $printers[[int]$pick - 1]
}
if (-not $tag) { Write-Host '  No printer chosen. Nothing was changed.' -ForegroundColor Red; return }

# 2. Stop Windows from changing the default printer by itself, then make the tag printer the default.
$key = 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Windows'
Set-ItemProperty -Path $key -Name LegacyDefaultPrinterMode -Value 1 -Type DWord
Invoke-CimMethod -InputObject $tag -MethodName SetDefaultPrinter | Out-Null
Write-Host ("  [OK] Default printer is now: {0}" -f $tag.Name) -ForegroundColor Green

# 3. Find Edge or Chrome.
$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$exe = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $exe) { Write-Host '  Could not find Microsoft Edge or Google Chrome.' -ForegroundColor Red; return }

# 4. Desktop shortcut. Its own profile folder keeps it separate from the normal browser windows,
#    so kiosk printing works even while the normal browser is open.
$profileDir = Join-Path $env:LOCALAPPDATA 'AbharanamTags'
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Print tags directly.lnk'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = $exe
$sh.Arguments = "--kiosk-printing --no-first-run --user-data-dir=`"$profileDir`" $site"
$sh.IconLocation = "$exe,0"
$sh.Description = 'Abharanam shop software - tags print straight to the tag printer'
$sh.Save()
Write-Host '  [OK] Desktop shortcut made: Print tags directly' -ForegroundColor Green

Write-Host ''
Write-Host '  All done. Open "Print tags directly" from the desktop, log in once, and print a tag.'
Write-Host '  Print bills from your normal browser, not from this shortcut.'
