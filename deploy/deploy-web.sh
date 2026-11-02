#!/usr/bin/env bash
# Run ON the server after `git pull`:   bash deploy/deploy-web.sh
# Builds rnd-ui with the production API URL and swaps it into nginx's ui-dist
# (previous build is kept as a backup).
set -euo pipefail
ROOT=/var/www/school-erp
export VITE_API_URL="${VITE_API_URL:-https://18-61-239-173.sslip.io/api}"
cd "$(dirname "$0")/../rnd-ui"

npm ci --no-audit --no-fund
npm run build
test -f dist/index.html

sudo cp -a "$ROOT/ui-dist" "$ROOT/ui-dist.bak-$(date +%Y%m%d-%H%M%S)"
sudo rm -rf "$ROOT"/ui-dist/*
sudo cp -a dist/. "$ROOT/ui-dist/"
sudo chown -R www-data:www-data "$ROOT/ui-dist"
ls -d "$ROOT"/ui-dist.bak-* | sort | head -n -3 | xargs -r sudo rm -rf   # keep 3 newest backups
echo "Web UI deployed (API $VITE_API_URL)"
