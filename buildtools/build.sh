#!/usr/bin/env bash

set -eEu -o pipefail

PROJECT=""
export NODE_ENV=production
export GRIST_BUNDLE_MINIFY=1
MODE="${1:-}"
if [[ -e ext/app ]]; then
  PROJECT="tsconfig-ext.json"
  echo "Using extra app directory"
elif [[ "${MODE}" == "prod" ]]; then
  PROJECT="tsconfig-prod.json"
  echo "Building for production"
else
  export NODE_ENV=development
  export GRIST_BUNDLE_MINIFY=0
  echo "No extra app directory found"
fi

ROLLDOWN_CONFIG=buildtools/rolldown.config.mjs
if [[ -e ext/buildtools/rolldown.config.mjs ]]; then
  # Allow the client bundle config to be replaced (useful for grist-static).
  ROLLDOWN_CONFIG=ext/buildtools/rolldown.config.mjs
elif [[ -e ext/buildtools/webpack.config.js ]]; then
  echo "ERROR: ext/buildtools/webpack.config.js is no longer used." >&2
  echo "Provide ext/buildtools/rolldown.config.mjs instead." >&2
  exit 1
fi

# Records the build's version, channel, and git commit in app/common/version.ts, overriding the
# stub in stubs/. channel is "release" only for a clean checkout of a release tag (or when
# GRIST_BUILD_CHANNEL is set, e.g. in Docker, where no .git is present). This is currently used
# to gate the "Switch to full edition" button on release builds of Grist.
build_version_file() {
  local out=app/common/version.ts
  local tmp="${out}.tmp"
  local version commit channel
  version=$(node -p "require('./package.json').version")
  commit="${GRIST_BUILD_COMMIT:-}"
  channel="${GRIST_BUILD_CHANNEL:-}"
  if git rev-parse --git-dir >/dev/null 2>&1; then
    local dirty=""
    git diff --quiet HEAD 2>/dev/null || dirty="M"
    : "${commit:=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)${dirty}}"
    if [[ -z "$channel" ]]; then
      local tag
      tag=$(git describe --tags --exact-match HEAD 2>/dev/null || true)
      if [[ -z "$dirty" && "$tag" == "v$version" ]]; then channel="release"; else channel="core"; fi
    fi
  fi
  : "${commit:=unknown}"
  : "${channel:=core}"
  mkdir -p app/common
  cat > "$tmp" <<EOF
export const version = "$version";
export const channel = "$channel";
export const gitcommit = "$commit";
EOF
  if cmp --silent "$tmp" "$out" 2>/dev/null; then rm "$tmp"; else mv "$tmp" "$out"; fi
}

build_version_file
set -x
node buildtools/sanitize_translations.js
if [[ -d ext/assets/locales ]]; then
  node buildtools/sanitize_translations.js ext/assets/locales
fi
tsc --build $PROJECT
node buildtools/write_static_locales.js assets/locales ext/assets/locales
buildtools/update_type_info.sh app
rolldown --config "$ROLLDOWN_CONFIG"
rolldown --config buildtools/rolldown.check.mjs
rolldown --config buildtools/rolldown.api.config.mjs
cat app/client/*.css app/client/*/*.css > static/bundle.css
