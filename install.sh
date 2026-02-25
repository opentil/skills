#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "  OpenTIL Skill Installer"
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "  Node.js is required but not found."
  echo ""
  echo "  Install Node.js first:"
  echo "    macOS:   brew install node"
  echo "    Linux:   https://nodejs.org/en/download"
  echo "    Windows: https://nodejs.org/en/download"
  echo ""
  echo "  Then re-run:"
  echo "    curl -fsSL til.so/i | bash"
  echo ""
  exit 1
fi

# Check Node.js version (>= 18)
NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  Node.js 18+ required (found $(node -v))"
  echo "  Update: brew upgrade node  or  https://nodejs.org"
  exit 1
fi

# Delegate to @opentil/cli via npx
exec npx --yes @opentil/cli@latest "$@"
