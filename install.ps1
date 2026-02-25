# OpenTIL Skill Installer (Windows)
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  OpenTIL Skill Installer"
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  Node.js is required but not found."
    Write-Host ""
    Write-Host "  Install Node.js first:"
    Write-Host "    winget install OpenJS.NodeJS"
    Write-Host "    or: https://nodejs.org/en/download"
    Write-Host ""
    Write-Host "  Then re-run:"
    Write-Host "    irm til.so/install.ps1 | iex"
    Write-Host ""
    exit 1
}

# Check Node.js version (>= 18)
$nodeVersion = (node -v) -replace '^v', ''
$major = [int]($nodeVersion.Split('.')[0])
if ($major -lt 18) {
    Write-Host "  Node.js 18+ required (found v$nodeVersion)"
    Write-Host "  Update: winget upgrade OpenJS.NodeJS  or  https://nodejs.org"
    exit 1
}

# Delegate to @opentil/cli via npx
npx --yes @opentil/cli@latest @args
