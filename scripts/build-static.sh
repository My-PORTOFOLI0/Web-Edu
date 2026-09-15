#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUTPUT_DIR="$PROJECT_DIR/dist"

if [[ "$OUTPUT_DIR" != "$PROJECT_DIR/dist" ]]; then
  echo "Lokasi output build tidak valid." >&2
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

cp "$PROJECT_DIR/index.html" "$OUTPUT_DIR/index.html"
cp "$PROJECT_DIR/admin.html" "$OUTPUT_DIR/admin.html"
cp "$PROJECT_DIR/404.html" "$OUTPUT_DIR/404.html"
cp "$PROJECT_DIR/robots.txt" "$OUTPUT_DIR/robots.txt"
cp "$PROJECT_DIR/_headers" "$OUTPUT_DIR/_headers"
cp "$PROJECT_DIR/_redirects" "$OUTPUT_DIR/_redirects"
cp -R "$PROJECT_DIR/assets" "$OUTPUT_DIR/assets"
cp -R "$PROJECT_DIR/pages" "$OUTPUT_DIR/pages"

find "$OUTPUT_DIR" -name ".DS_Store" -delete

node "$SCRIPT_DIR/check-static.mjs" "$OUTPUT_DIR"

echo "Build hosting tersedia di: $OUTPUT_DIR"
