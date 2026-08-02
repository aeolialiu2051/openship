# Vibrail installer (Windows) — https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.sh
#
#   irm https://raw.githubusercontent.com/aeolialiu2051/vibrail/main/scripts/install.ps1 | iex
#
# Installs the Vibrail CLI. Then `vibrail up` runs Vibrail locally (API +
# dashboard), or `vibrail install` fetches the desktop app. Bun is the runtime;
# this installs it for you if it's missing (no Node or npm needed).
#
# Env overrides:
#   $env:VIBRAIL_VERSION = "0.1.9"   # pin a specific CLI version

$ErrorActionPreference = "Stop"
function Info($m) { Write-Host "==> $m" -ForegroundColor Cyan }

# 1. Ensure Bun (the runtime; no Node/npm needed).
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Info "Installing the Bun runtime..."
  Invoke-RestMethod https://bun.sh/install.ps1 | Invoke-Expression
  $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
}

if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
  Write-Error "Bun installed but 'bun' is not on PATH. Open a new terminal and re-run."
  exit 1
}

# 2. Install the Vibrail CLI globally (Bun fetches it from the registry —
#    the npm CLI itself is never invoked).
$pkg = "vibrail"
if ($env:VIBRAIL_VERSION) { $pkg = "vibrail@$($env:VIBRAIL_VERSION)" }
Info "Installing the Vibrail CLI ($pkg)..."
bun add -g $pkg

Write-Host ""
Write-Host "Vibrail installed." -ForegroundColor Green
Write-Host "  vibrail up        # run Vibrail locally (API + dashboard)"
Write-Host "  vibrail install   # or install the desktop app"
Write-Host "  vibrail --help    # all commands"
Write-Host ""
Write-Host "If 'vibrail' isn't found, restart your terminal (PATH was updated)."
