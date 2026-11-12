<#
  TV Home build: packages the home screen and the smart home panel for an LG
  webOS TV and installs them in Developer Mode.

  Configuration comes from .env in this folder (see .env.example) and from the
  JSON file that TVH_CONFIG_FILE points to. A variable already set in the shell
  wins over .env. Values that start with op:// are read with the 1Password CLI
  at build time and only end up inside the packages that go to the TV.

  Usage:  .\build.ps1              build + install both apps
          .\build.ps1 -NoInstall   only build the .ipk files
          .\build.ps1 -StageOnly   only assemble dist\launcher and dist\panel, no packaging
          .\build.ps1 -Launch      also open the home screen afterwards
#>
param([switch]$NoInstall, [switch]$StageOnly, [switch]$Launch)
$ErrorActionPreference = 'Continue'   # native tools (ares, op) write info to stderr
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

# --- .env ---------------------------------------------------------------------
$envFile = Join-Path $root '.env'
if (-not (Test-Path $envFile)) { Write-Error ".env not found. Copy .env.example to .env and fill it in."; exit 1 }
$E = @{}
foreach ($line in Get-Content -Encoding UTF8 $envFile) {
  $l = $line.Trim()
  if (-not $l -or $l.StartsWith('#')) { continue }
  $i = $l.IndexOf('=')
  if ($i -lt 1) { continue }
  $v = $l.Substring($i + 1).Trim()
  if ($v.Length -ge 2 -and (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'")))) { $v = $v.Substring(1, $v.Length - 2) }
  $E[$l.Substring(0, $i).Trim()] = $v
}
foreach ($k in @($E.Keys)) {
  $shell = [Environment]::GetEnvironmentVariable($k)
  if ($shell) { $E[$k] = $shell }
}
function Get-Setting([string]$name, [string]$default = '') {
  if ($E.ContainsKey($name) -and $E[$name]) { return $E[$name] }
  return $default
}
foreach ($req in 'TVH_LAUNCHER_APP_ID', 'TVH_PANEL_APP_ID', 'TVH_CONFIG_FILE') {
  if (-not (Get-Setting $req)) { Write-Error "$req is missing in .env"; exit 1 }
}

# --- UI config (JSON) with ${TVH_...} placeholders expanded from .env ----------------
$cfgPath = Join-Path $root (Get-Setting 'TVH_CONFIG_FILE')
if (-not (Test-Path $cfgPath)) { Write-Error "$cfgPath not found. Copy config.example.json to it and edit."; exit 1 }
$cfgText = Get-Content -Raw -Encoding UTF8 $cfgPath
$cfgText = [regex]::Replace($cfgText, '\$\{(TVH_[A-Z0-9_]+)\}', [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  $json = (Get-Setting $m.Groups[1].Value) | ConvertTo-Json
  return $json.Substring(1, $json.Length - 2)
})
$cfg = $cfgText | ConvertFrom-Json

# WiFi name, password and QR code live in a separate JSON file that stays out of Git.
$wifiFile = Join-Path $root (Get-Setting 'TVH_WIFI_FILE' 'wifi.local.json')
$wifi = $null
if (Test-Path $wifiFile) { $wifi = Get-Content -Raw -Encoding UTF8 $wifiFile | ConvertFrom-Json }
else { Write-Warning "$(Split-Path -Leaf $wifiFile) not found; Share WiFi will show 'not configured'" }

# A value starting with op:// is resolved with the 1Password CLI, anything else is used as it is.
function Resolve-Secret($value) {
  if (-not $value) { return $null }
  if (-not $value.StartsWith('op://')) { return $value }
  $v = (& op read $value 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $v) { return $null }
  return $v
}

# --- font (Outfit, SIL Open Font License) -----------------------------------
$fontDir = Join-Path $root 'shared\fonts'
$font = Join-Path $fontDir 'Outfit.ttf'
if (-not (Test-Path $font)) {
  New-Item -ItemType Directory -Force -Path $fontDir | Out-Null
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/google/fonts/raw/main/ofl/outfit/Outfit%5Bwght%5D.ttf' -OutFile $font -ErrorAction Stop
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/google/fonts/raw/main/ofl/outfit/OFL.txt' -OutFile (Join-Path $fontDir 'OFL.txt') -ErrorAction Stop
    Write-Host "font: downloaded Outfit"
  } catch { Write-Warning "font download failed, the TV will use its system font" }
}

# --- app icons (drawn once with System.Drawing) ------------------------------
Add-Type -AssemblyName System.Drawing
function New-Icon([string]$path, [int]$size, [string]$bg, [string]$fg, [string]$kind) {
  if (Test-Path $path) { return }
  $s = $size * 4
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $r = [int]($s * 0.22); $d = 2 * $r
  $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
  $gp.AddArc(0, 0, $d, $d, 180, 90); $gp.AddArc($s - $d - 1, 0, $d, $d, 270, 90)
  $gp.AddArc($s - $d - 1, $s - $d - 1, $d, $d, 0, 90); $gp.AddArc(0, $s - $d - 1, $d, $d, 90, 90); $gp.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($bg))), $gp)
  $fgc = [System.Drawing.ColorTranslator]::FromHtml($fg)
  $pen = New-Object System.Drawing.Pen $fgc, ([single]($s * 0.055))
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  function P([double]$x, [double]$y) { New-Object System.Drawing.PointF ([single]($x * $s)), ([single]($y * $s)) }
  if ($kind -eq 'house') {
    $g.DrawLines($pen, [System.Drawing.PointF[]]@((P 0.24 0.50), (P 0.50 0.28), (P 0.76 0.50)))
    $g.DrawLines($pen, [System.Drawing.PointF[]]@((P 0.31 0.46), (P 0.31 0.74), (P 0.69 0.74), (P 0.69 0.46)))
    $g.DrawLines($pen, [System.Drawing.PointF[]]@((P 0.45 0.74), (P 0.45 0.60), (P 0.55 0.60), (P 0.55 0.74)))
  } else {
    $g.DrawRectangle($pen, [single](0.22 * $s), [single](0.30 * $s), [single](0.56 * $s), [single](0.20 * $s))
    $brush = New-Object System.Drawing.SolidBrush $fgc
    foreach ($i in 0..2) { $g.FillRectangle($brush, [single]((0.22 + 0.2 * $i) * $s), [single](0.58 * $s), [single](0.16 * $s), [single](0.14 * $s)) }
  }
  $small = New-Object System.Drawing.Bitmap $size, $size
  $g2 = [System.Drawing.Graphics]::FromImage($small)
  $g2.InterpolationMode = 'HighQualityBicubic'; $g2.SmoothingMode = 'AntiAlias'
  $g2.DrawImage($bmp, 0, 0, $size, $size)
  $small.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g2.Dispose(); $small.Dispose(); $g.Dispose(); $bmp.Dispose()
}
foreach ($sz in @(@(80, 'icon.png'), @(130, 'largeIcon.png'))) {
  New-Icon (Join-Path $root "launcher\$($sz[1])") $sz[0] '#101319' '#F2F4F7' 'dock'
  New-Icon (Join-Path $root "panel\$($sz[1])") $sz[0] '#FFB547' '#0A0C10' 'house'
}

# --- secrets and runtime config ---------------------------------------------
$haToken = Resolve-Secret (Get-Setting 'TVH_HA_TOKEN')
if (-not $haToken) { Write-Warning "Home Assistant token missing or not readable (TVH_HA_TOKEN)" }
$jfUrl = Get-Setting 'TVH_JELLYFIN_URL'
$jfKey = $null
$jfUser = Get-Setting 'TVH_JELLYFIN_USER_ID'
if ($jfUrl) {
  $jfKey = Resolve-Secret (Get-Setting 'TVH_JELLYFIN_API_KEY')
  if ($jfKey -and -not $jfUser) {
    try {
      $auth = @{ Authorization = "MediaBrowser Client=`"TV Home build`", Device=`"PC`", DeviceId=`"tvhome-build`", Version=`"1.0.0`", Token=`"$jfKey`"" }
      $users = Invoke-RestMethod -Uri ($jfUrl.TrimEnd('/') + '/Users') -Headers $auth -TimeoutSec 15 -ErrorAction Stop
      $pick = $null
      $jfName = Get-Setting 'TVH_JELLYFIN_USER_NAME'
      if ($jfName) { $pick = $users | Where-Object { $_.Name -eq $jfName } | Select-Object -First 1 }
      if (-not $pick) { $pick = $users | Where-Object { $_.Policy.IsAdministrator } | Select-Object -First 1 }
      if (-not $pick) { $pick = $users | Select-Object -First 1 }
      $jfUser = $pick.Id
      Write-Host "jellyfin: using user '$($pick.Name)'"
    } catch { Write-Warning "Jellyfin lookup failed: $($_.Exception.Message)" }
  } elseif (-not $jfKey) { Write-Warning "Jellyfin API key missing or not readable (TVH_JELLYFIN_API_KEY); the Moonfin row will just open Moonfin" }
}

$appIds = @{ launcher = (Get-Setting 'TVH_LAUNCHER_APP_ID'); panel = (Get-Setting 'TVH_PANEL_APP_ID') }
$runtime = [ordered]@{
  appIds   = [ordered]@{ launcher = $appIds.launcher; panel = $appIds.panel }
  ha       = [ordered]@{ url = (Get-Setting 'TVH_HA_URL'); token = $haToken }
  jellyfin = [ordered]@{ url = $jfUrl; apiKey = $jfKey; userId = $jfUser }
  panelKey = (Get-Setting 'TVH_PANEL_KEY')
  lgHomePass = (Get-Setting 'TVH_HA_LG_HOME_PASS_ENTITY')
  wifi     = $wifi
  home     = $cfg.home
  dock     = $cfg.dock
  panel    = $cfg.panel
}
$configJs = 'window.TVH_CONFIG = ' + ($runtime | ConvertTo-Json -Depth 20 -Compress) + ';'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# --- assemble and package ----------------------------------------------------
$dist = Join-Path $root 'dist'
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Force -Path (Join-Path $dist 'ipk') | Out-Null
foreach ($app in 'launcher', 'panel') {
  $out = Join-Path $dist $app
  Copy-Item -Recurse (Join-Path $root $app) $out
  Copy-Item -Recurse (Join-Path $root 'shared') (Join-Path $out 'shared')
  [IO.File]::WriteAllText((Join-Path $out 'config.js'), $configJs, $utf8)
  # appinfo.json in the repo carries placeholder values; the real ID and vendor come from .env.
  $infoPath = Join-Path $out 'appinfo.json'
  $info = Get-Content -Raw -Encoding UTF8 $infoPath | ConvertFrom-Json
  $info.id = $appIds[$app]
  if (Get-Setting 'TVH_VENDOR') { $info.vendor = Get-Setting 'TVH_VENDOR' }
  [IO.File]::WriteAllText($infoPath, ($info | ConvertTo-Json -Depth 5), $utf8)
}
if ($StageOnly) { Write-Host "staged: dist\launcher and dist\panel (not packaged)"; exit 0 }
foreach ($app in 'launcher', 'panel') {
  & ares-package --no-minify (Join-Path $dist $app) -o (Join-Path $dist 'ipk') 2>&1 | Out-Host
}
$ipks = Get-ChildItem (Join-Path $dist 'ipk') -Filter *.ipk
$ipks | ForEach-Object { Write-Host "built: $($_.Name) ($([math]::Round($_.Length/1KB)) KB)" }

if (-not $NoInstall) {
  $device = Get-Setting 'TVH_TV_DEVICE' 'tv'
  foreach ($i in $ipks) { & ares-install -d $device $i.FullName 2>&1 | Out-Host }
  if ($Launch) { & ares-launch -d $device $appIds.launcher 2>&1 | Out-Host }
}
# The packages contain the tokens; keep only the .ipk files, not the loose copies.
foreach ($app in 'launcher', 'panel') { Remove-Item -Recurse -Force (Join-Path $dist $app) }
