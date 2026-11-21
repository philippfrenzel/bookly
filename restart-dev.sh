#!/usr/bin/env bash
# restart-dev.sh: stops running Bookly dev services, pulls the latest main,
# installs dependencies and starts `npm run dev` again (migrations apply on start).
#
# Usage: ./restart-dev.sh
# Ports can be overridden with API_PORT / WEB_PORT (defaults 3000 / 5173).
set -euo pipefail

# Wrapped in a function so bash parses the whole script before running it:
# `git checkout main` may replace this file while it runs.
main() {

  cd "$(dirname "$0")"

  API_PORT="${API_PORT:-3000}"
  WEB_PORT="${WEB_PORT:-5173}"

  # 1. Stop running services: the concurrently wrapper and anything listening on the ports.
  echo "==> Prüfe laufende Dienste (Ports $API_PORT, $WEB_PORT)"
  pids="$(pgrep -f "concurrently -n server,web" || true) $(lsof -tiTCP:"$API_PORT" -sTCP:LISTEN 2>/dev/null || true) $(lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null || true)"
  pids="$(echo $pids | tr ' ' '\n' | sort -u | tr '\n' ' ')"
  if [ -n "${pids// /}" ]; then
    echo "    Stoppe Prozesse: $pids"
    kill $pids 2>/dev/null || true
    for _ in $(seq 1 10); do
      if ! lsof -tiTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1 && ! lsof -tiTCP:"$WEB_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        break
      fi
      sleep 0.5
    done
    # Force-kill whatever still holds the ports.
    leftover="$(lsof -tiTCP:"$API_PORT" -tiTCP:"$WEB_PORT" -sTCP:LISTEN 2>/dev/null || true)"
    [ -n "$leftover" ] && kill -9 $leftover 2>/dev/null || true
  else
    echo "    Keine laufenden Dienste gefunden"
  fi

  # 2. Pull the latest main. Refuse when tracked files have local changes.
  echo "==> Hole neuesten main"
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Abbruch: Es gibt lokale Änderungen an versionierten Dateien. Bitte committen oder stashen." >&2
    exit 1
  fi
  current="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$current" != "main" ]; then
    echo "    Wechsle von '$current' auf main"
    git checkout main
  fi
  git pull --ff-only origin main
  git log --oneline -1

  # 3. Install dependencies and start both servers in the foreground.
  echo "==> npm install"
  npm install

  echo "==> Starte Server: Web http://localhost:$WEB_PORT, API http://localhost:$API_PORT (Ctrl+C zum Beenden)"
  exec npm run dev
}

main "$@"
