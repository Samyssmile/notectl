#!/usr/bin/env bash
set -euo pipefail

PACKAGES=(
  "packages/adapters/angular"
  "packages/adapters/react"
  "packages/adapters/vue"
  "packages/adapters/svelte"
  "packages/plugins/toolbar"
  "packages/plugins/table"
)

ROOT_DIR="$(pwd)"
trap 'cd "$ROOT_DIR"' EXIT

USE_TOKEN=false
if [[ -n "${NPM_TOKEN:-}" ]]; then
  USE_TOKEN=true
  # Token in npmrc setzen (nur lokal, nicht committen!)
  npm config set //registry.npmjs.org/:_authToken "${NPM_TOKEN}" >/dev/null
  echo "🔐 Verwende NPM_TOKEN für Publish (kein OTP erforderlich)."
fi

OTP=""

prompt_otp() {
  echo -n "Gib dein npm OTP ein: "
  read -r OTP
  OTP="${OTP//[[:space:]]/}"
}

publish_one () {
  local pkg="$1"
  echo
  echo "==============================="
  echo "📦 Publish: $pkg"
  echo "==============================="

  cd "$ROOT_DIR/$pkg"
  [[ -f package.json ]] || { echo "❌ package.json fehlt – überspringe."; return 1; }

  if $USE_TOKEN; then
    npm publish --access public && { echo "✅ $pkg veröffentlicht"; return 0; }
    echo "⚠️ Publish mit Token fehlgeschlagen. Versuche OTP-Fallback…"
    USE_TOKEN=false
  fi

  [[ -n "${OTP:-}" ]] || prompt_otp
  while true; do
    set +e
    npm publish --access public --otp="$OTP"
    status=$?
    set -e
    [[ $status -eq 0 ]] && { echo "✅ $pkg veröffentlicht"; break; }
    echo -n "⚠️ Fehlgeschlagen (Exit $status). Neues OTP (Enter = erneut versuchen): "
    read -r NEW_OTP
    NEW_OTP="${NEW_OTP//[[:space:]]/}"
    [[ -n "$NEW_OTP" ]] && OTP="$NEW_OTP"
    sleep 2
  done
}

echo "🚀 Starte Publish für ${#PACKAGES[@]} Pakete…"
for p in "${PACKAGES[@]}"; do publish_one "$p"; done
echo "🎉 Fertig."
