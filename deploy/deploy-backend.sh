#!/usr/bin/env bash
# Run ON the server after `git pull`:   bash deploy/deploy-backend.sh
# Type-check -> build -> reload API + worker -> health check; rolls back dist on failure.
# The mobile app needs nothing: it calls this same API, so users see no update prompt.
set -euo pipefail
ROOT=/var/www/school-erp
cd "$(dirname "$0")/../rnd-service"

npm ci --no-audit --no-fund
npx tsc --noEmit                       # abort before touching the running build
STAMP=$(date +%Y%m%d-%H%M%S)
cp -a dist "$ROOT/dist.bak-$STAMP"
npm run build

pm2 reload school-erp-backend school-erp-worker --update-env
sleep 8
if ! curl -fsS http://127.0.0.1:5000/healthz >/dev/null; then
  echo "Health check failed - rolling back"
  rm -rf dist && cp -a "$ROOT/dist.bak-$STAMP" dist
  pm2 reload school-erp-backend school-erp-worker --update-env
  exit 1
fi
ls -d "$ROOT"/dist.bak-* 2>/dev/null | sort | head -n -3 | xargs -r rm -rf   # keep 3 newest backups
echo "Backend deployed at $(git rev-parse --short HEAD)"
