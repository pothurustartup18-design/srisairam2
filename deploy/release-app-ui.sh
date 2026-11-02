#!/usr/bin/env bash
# Run ON the server after `git pull`:   bash deploy/release-app-ui.sh   [--force] [--dry-run]
# Bundles app-ui, signs and publishes it as a live update; users get it under
# Settings -> App Updates. Refuses if native files changed (that needs a new APK).
set -euo pipefail
cd "$(dirname "$0")/../app-ui"
node scripts/release/server-release.mjs "$@"
