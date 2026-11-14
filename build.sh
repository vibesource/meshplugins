#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
build_plugin() {
  local name="$1" version archive
  [[ "$name" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Invalid plugin name: $name" >&2; return 1; }
  [[ -f "$name/plugin.json" ]] || { echo "No manifest for $name" >&2; return 1; }
  version=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["version"])' "$name/plugin.json")
  [[ "$version" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo "Invalid version" >&2; return 1; }
  archive="$(pwd)/dist/$name-$version.meshplugin"
  rm -f "$archive"
  ( cd "$name"; files=(plugin.json); [[ ! -d frontend ]] || files+=(frontend); [[ ! -d backend ]] || files+=(backend); zip -q -X -r "$archive" "${files[@]}" -x '*/__pycache__/*' '*.pyc' )
  zip -q -X "$archive" LICENSE
  echo "$archive"
}
if (( $# )); then for plugin in "$@"; do build_plugin "$plugin"; done
else for manifest in */plugin.json; do [[ -f "$manifest" ]] || continue; build_plugin "${manifest%/plugin.json}"; done; fi
