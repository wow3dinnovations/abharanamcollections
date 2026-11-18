<# : Abharanam - set up direct tag printing (double-click this file)
@echo off
title Abharanam - direct tag printing setup
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([IO.File]::ReadAllText('%~f0'))"
echo.
pause
exit /b
#>

# Installs a small print helper that starts with Windows. The shop website sends tags to it and it prints them
# straight on the USB tag printer, from any normal Chrome or Edge window, with no print window.
# Safe to run again: it just installs the newest helper.

$ErrorActionPreference = 'Stop'
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
Write-Host ("  [OK] Tag printer: {0}" -f $tag.Name) -ForegroundColor Green

# 2. Install the helper in this user's folder.
$dir = Join-Path $env:LOCALAPPDATA 'AbharanamPrint'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$helperFile = Join-Path $dir 'print-helper.ps1'
Set-Content -Path (Join-Path $dir 'printer.txt') -Value $tag.Name -Encoding UTF8
$helper = @'
# Abharanam tag print helper. Runs hidden on the shop computer and listens on http://127.0.0.1:17320 (this computer only).
# The shop website sends each tag as a black-and-white picture; this prints it on the USB tag printer, no print window.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$port = 17320
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$printerFile = Join-Path $dir 'printer.txt'
$logFile = Join-Path $dir 'helper.log'
$allowed = '^https://([a-z0-9-]+\.)*abharanamcollections\.com$|^http://localhost(:\d+)?$'

function Log($m) { try { Add-Content -Path $logFile -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $m) } catch {} }

# Only one helper at a time.
$first = $false
$script:mutex = New-Object System.Threading.Mutex($true, 'Local\AbharanamTagPrintHelper', [ref]$first)
if (-not $first) { return }

function Get-TagPrinter {
  if (Test-Path $printerFile) { $n = (Get-Content $printerFile -Raw).Trim(); if ($n) { return $n } }
  $p = Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'xprinter|xp-?420|label|tag' } | Select-Object -First 1
  if ($p) { return $p.Name }
  return $null
}

function Print-Tags($job) {
  $name = Get-TagPrinter
  if (-not $name) { throw 'Tag printer not found. Run the setup file again.' }
  $script:W = [double]$job.width_mm
  $script:H = [double]$job.height_mm
  if ($script:W -lt 5 -or $script:H -lt 5 -or $script:W -gt 300 -or $script:H -gt 300) { throw 'Wrong tag size.' }
  $script:pages = New-Object System.Collections.ArrayList
  foreach ($t in @($job.images)) {
    $bytes = [Convert]::FromBase64String([string]$t.png)
    $img = [System.Drawing.Image]::FromStream((New-Object System.IO.MemoryStream(, $bytes)))
    $n = [math]::Max(0, [math]::Min(500, [int]$t.copies))
    for ($k = 0; $k -lt $n; $k++) { [void]$script:pages.Add($img) }
  }
  if ($script:pages.Count -eq 0) { return 0 }
  $script:page = 0
  $doc = New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName = $name
  if (-not $doc.PrinterSettings.IsValid) { throw "Printer '$name' is not available. Is it switched on?" }
  $doc.DocumentName = 'Tags'
  $doc.PrintController = New-Object System.Drawing.Printing.StandardPrintController
  $size = New-Object System.Drawing.Printing.PaperSize('Tag', [int][math]::Round($script:W / 0.254), [int][math]::Round($script:H / 0.254))
  $doc.DefaultPageSettings.PaperSize = $size
  $doc.DefaultPageSettings.Landscape = $false
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $doc.OriginAtMargins = $false
  $doc.add_PrintPage({
    param($s, $e)
    $g = $e.Graphics
    $g.PageUnit = [System.Drawing.GraphicsUnit]::Millimeter
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    # The drawing starts at the printer's unprintable edge; move back so 0,0 is the tag's corner.
    $g.TranslateTransform([single](-$e.PageSettings.HardMarginX * 0.254), [single](-$e.PageSettings.HardMarginY * 0.254))
    $g.DrawImage($script:pages[$script:page], [single]0, [single]0, [single]$script:W, [single]$script:H)
    $script:page++
    $e.HasMorePages = $script:page -lt $script:pages.Count
  })
  $doc.Print()
  $doc.Dispose()
  return $script:pages.Count
}

function Send($stream, $code, $origin, $body) {
  $status = @{ 200 = 'OK'; 204 = 'No Content'; 400 = 'Bad Request'; 403 = 'Forbidden'; 404 = 'Not Found'; 500 = 'Error' }[$code]
  $bytes = [Text.Encoding]::UTF8.GetBytes([string]$body)
  $h = "HTTP/1.1 $code $status`r`nContent-Type: application/json`r`nContent-Length: $($bytes.Length)`r`nConnection: close`r`n"
  if ($origin) {
    $h += "Access-Control-Allow-Origin: $origin`r`nVary: Origin`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`n"
    $h += "Access-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nAccess-Control-Max-Age: 600`r`n"
  }
  $hb = [Text.Encoding]::ASCII.GetBytes($h + "`r`n")
  $stream.Write($hb, 0, $hb.Length)
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Flush()
}

function Handle($client) {
  $client.ReceiveTimeout = 10000
  $stream = $client.GetStream()
  $buf = New-Object byte[] 65536
  $ms = New-Object System.IO.MemoryStream
  $headerEnd = -1
  while ($headerEnd -lt 0) {
    $n = $stream.Read($buf, 0, $buf.Length)
    if ($n -le 0) { return }
    $ms.Write($buf, 0, $n)
    $headerEnd = [Text.Encoding]::ASCII.GetString($ms.ToArray()).IndexOf("`r`n`r`n")
    if ($ms.Length -gt 65536 -and $headerEnd -lt 0) { return }
  }
  $all = $ms.ToArray()
  $lines = [Text.Encoding]::ASCII.GetString($all, 0, $headerEnd) -split "`r`n"
  $method, $path = ($lines[0] -split ' ')[0, 1]
  $headers = @{}
  foreach ($l in $lines[1..($lines.Count - 1)]) { $i = $l.IndexOf(':'); if ($i -gt 0) { $headers[$l.Substring(0, $i).Trim().ToLower()] = $l.Substring($i + 1).Trim() } }
  $origin = $headers['origin']
  if ($origin -and $origin -notmatch $allowed) { Send $stream 403 $null '{"ok":false,"error":"Not allowed"}'; return }
  if ($method -eq 'OPTIONS') { Send $stream 204 $origin ''; return }
  if ($method -eq 'GET' -and $path -like '/status*') {
    $p = Get-TagPrinter
    Send $stream 200 $origin (@{ ok = $true; printer = $p; version = 1 } | ConvertTo-Json -Compress)
    return
  }
  if ($method -eq 'POST' -and $path -like '/print*') {
    $len = [int]$headers['content-length']
    if ($len -le 0 -or $len -gt 20MB) { Send $stream 400 $origin '{"ok":false,"error":"Bad request"}'; return }
    $body = New-Object System.IO.MemoryStream
    $start = $headerEnd + 4
    $body.Write($all, $start, $all.Length - $start)
    while ($body.Length -lt $len) {
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -le 0) { break }
      $body.Write($buf, 0, $n)
    }
    try {
      $job = [Text.Encoding]::UTF8.GetString($body.ToArray()) | ConvertFrom-Json
      $count = Print-Tags $job
      Log "Printed $count tag(s)"
      Send $stream 200 $origin (@{ ok = $true; printed = $count } | ConvertTo-Json -Compress)
    } catch {
      Log "Print failed: $($_.Exception.Message)"
      Send $stream 500 $origin (@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
    }
    return
  }
  Send $stream 404 $origin '{"ok":false}'
}

$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
$listener.Start()
Log "Started. Tag printer: $(Get-TagPrinter)"
while ($true) {
  $client = $listener.AcceptTcpClient()
  try { Handle $client } catch { Log "Error: $($_.Exception.Message)" } finally { $client.Close() }
}
'@
Set-Content -Path $helperFile -Value $helper -Encoding UTF8

# 3. Start it with Windows (hidden).
$runArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$helperFile`""
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Abharanam tag printer.lnk'
$sh = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$sh.TargetPath = (Get-Command powershell.exe).Source
$sh.Arguments = $runArgs
$sh.WindowStyle = 7
$sh.Description = 'Abharanam: prints shop tags straight to the tag printer'
$sh.Save()

# 4. Stop an older helper, start the new one now.
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
  Where-Object { $_.CommandLine -like '*AbharanamPrint*print-helper.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 500
Start-Process -FilePath (Get-Command powershell.exe).Source -ArgumentList $runArgs -WindowStyle Hidden
Write-Host '  [OK] Print helper installed and set to start with Windows' -ForegroundColor Green

# 5. Check that it answers.
$ok = $false
for ($i = 0; $i -lt 10 -and -not $ok; $i++) {
  Start-Sleep -Milliseconds 700
  try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:17320/status' -TimeoutSec 2; $ok = [bool]$r.ok } catch {}
}
Write-Host ''
if ($ok) {
  Write-Host '  All done. In Chrome or Edge, open the shop software and click Print tag.' -ForegroundColor Green
  Write-Host '  The first time, the browser may ask to allow access to devices on this computer: click Allow.'
} else {
  Write-Host '  The helper did not start. Please send a photo of this window.' -ForegroundColor Red
}
