#!/usr/bin/env bash
# Runs every part's checks: shared logic, the backend's typecheck and lint, then the web
# app's typecheck, lint and tests. Run before committing.
set -euo pipefail
cd "$(dirname "$0")/.."

for dir in shared backend web; do
  echo "› $dir"
  npm --prefix "$dir" run check
done
