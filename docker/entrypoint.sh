#!/bin/sh
set -eu

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  echo "[entrypoint] running drizzle migrations"
  cd /app/_migrate
  ./node_modules/.bin/drizzle-kit migrate
  cd /app
else
  echo "[entrypoint] RUN_MIGRATIONS=0 — skipping migrations"
fi

exec "$@"
