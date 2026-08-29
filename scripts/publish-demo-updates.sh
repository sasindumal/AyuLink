#!/usr/bin/env bash
# Publish all four apps as EAS Updates on the `preview` channel, so the
# demo-hub QR codes open the real apps in Expo Go — no dev server, no APK.
#
#   ./scripts/publish-demo-updates.sh "kitchen-sink demo build"
#
# One-time prep (per app, or just run this — it checks):
#   cd frontend/mobile/<app>
#   npx expo install expo-updates       # locks the SDK-correct version
#   eas login                           # once, on your Expo account
#   eas update:configure                # confirms app.json updates.url (already set)
#
# After this runs, refresh the hub's QR codes:
#   node scripts/gen-demo-qr.js
set -euo pipefail

MSG="${1:-demo $(date -u +%Y-%m-%dT%H:%MZ)}"
BRANCH="preview"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPS=(patient-app doctor-app pharmacy-app channeling-center-app)

command -v eas >/dev/null 2>&1 || { echo "eas-cli not found — npm i -g eas-cli"; exit 1; }

for app in "${APPS[@]}"; do
  dir="$ROOT/frontend/mobile/$app"
  echo ""
  echo "──────────── $app ────────────"
  if ! grep -q '"expo-updates"' "$dir/package.json"; then
    echo "  expo-updates missing — run: (cd $dir && npx expo install expo-updates)"
    exit 1
  fi
  (
    cd "$dir"
    eas update --branch "$BRANCH" --message "$MSG" --non-interactive
    # The exp://u.expo.dev/<id>?channel-name=preview deep link resolves
    # through a CHANNEL, and `eas update` does not create one. Create it
    # (auto-points at the same-named branch); harmless if it already exists.
    eas channel:create "$BRANCH" 2>/dev/null || true
    eas channel:edit "$BRANCH" --branch "$BRANCH" --non-interactive 2>/dev/null || true
  )
done

echo ""
echo "Done. Deep links (open in Expo Go):"
node -e '
  const c = require("'"$ROOT"'/frontend/web/public/demo/config.json");
  for (const a of c.apps)
    console.log(`  ${a.role.padEnd(18)} exp://u.expo.dev/${a.easProjectId}?channel-name='"$BRANCH"'`);
'
echo ""
echo "Now: node scripts/gen-demo-qr.js   &&   redeploy ayulink-web"
