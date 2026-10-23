#!/usr/bin/env bash
# Build the demo and publish it to a server over SSH.
#
#   scripts/deploy-demo.sh <ssh-host> [remote-dir]
#
# Each deploy goes into <remote-dir>/releases/<timestamp>; <remote-dir>/current
# is then switched to it in one step, and the three newest releases are kept.
# Point your web server's root at <remote-dir>/current (see docs/hosting-the-demo.md).
set -euo pipefail

host="${1:?usage: scripts/deploy-demo.sh <ssh-host> [remote-dir]}"
remote_dir="${2:-/var/www/holdings-demo}"
release="$(date -u +%Y%m%d%H%M%S)"

cd "$(dirname "$0")/.."
npm run build:demo

tar -C dist -czf - . | ssh "$host" "set -e
  mkdir -p '$remote_dir/releases/$release'
  tar --no-same-owner -xzf - -C '$remote_dir/releases/$release'
  ln -sfn 'releases/$release' '$remote_dir/current.tmp'
  mv -T '$remote_dir/current.tmp' '$remote_dir/current'
  cd '$remote_dir/releases' && ls -1 | sort | head -n -3 | xargs -r rm -rf
  echo \"Deployed $release to $host:$remote_dir/current\""
