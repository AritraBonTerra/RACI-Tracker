#!/usr/bin/env bash
# Installs the pinned Bun release for Vercel builds and runs the frozen install
# with it. Vercel's build image ships whichever Bun its CLI bundles (1.3.14 on
# 2026-09-15, which cannot read the version-2 bun.lock that Bun 1.4 writes), so
# the platform's Bun is not a stable choice. The release zip comes from GitHub
# and is checked against the digest Bun publishes with it before anything from
# it runs: the deploy key is in this environment, so nothing unverified may be.
set -euo pipefail

BUN_VERSION="1.4.0"
ASSET="bun-linux-x64.zip"
# https://github.com/oven-sh/bun/releases/download/bun-v1.4.0/SHASUMS256.txt
BUN_SHA256="2d03fb5fb83ac8b567aca0a281b2ce1a1a19d488f56c2968d88c3f25e92fe452"

dir="$(mktemp -d)"
curl -fsSL -o "$dir/$ASSET" \
  "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/${ASSET}"

if command -v sha256sum >/dev/null; then
  echo "${BUN_SHA256}  $dir/$ASSET" | sha256sum -c - >/dev/null
else
  echo "${BUN_SHA256}  $dir/$ASSET" | shasum -a 256 -c - >/dev/null
fi

unzip -q "$dir/$ASSET" -d "$dir"
bun="$dir/bun-linux-x64/bun"
"$bun" --version
"$bun" install --frozen-lockfile
