#!/usr/bin/env bash

set -x

NO_NODEMON=false
for arg in $@; do
  if [[ $arg == "--no-nodemon" ]]; then
    NO_NODEMON=true
  fi
done

PROJECT=""
if [[ -e ext/app ]]; then
  PROJECT="tsconfig-ext.json"
fi
ROLLDOWN_CONFIG=buildtools/rolldown.config.mjs
if [[ -e ext/buildtools/rolldown.config.mjs ]]; then
  ROLLDOWN_CONFIG=ext/buildtools/rolldown.config.mjs
elif [[ -e ext/buildtools/webpack.config.js ]]; then
  echo "ERROR: ext/buildtools/webpack.config.js is no longer used." >&2
  echo "Provide ext/buildtools/rolldown.config.mjs instead." >&2
  exit 1
fi

if [ ! -e _build ]; then
  buildtools/build.sh
fi

export NODE_ENV=development
export GRIST_BUNDLE_MINIFY=0
tsc --build -w --preserveWatchOutput $PROJECT &
css_files="app/client/**/*.css"
chokidar "${css_files}" -c "bash -O globstar -c 'cat ${css_files} > static/bundle.css'" &
rolldown --config "$ROLLDOWN_CONFIG" --watch &
# Show debug-level logs while developing.
: "${GRIST_LOG_LEVEL:=debug}"
export GRIST_LOG_LEVEL
! $NO_NODEMON && NODE_PATH=_build:_build/ext:_build/stubs:ext/node_modules nodemon ${NODE_INSPECT} --delay 1 -w _build/app/server -w _build/app/common _build/stubs/app/server/server.js &

wait
