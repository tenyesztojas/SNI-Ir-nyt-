#!/usr/bin/env bash
# iOS-szimulátoros elrendezési teszt (CSAK CI-futtatón, macOS).
# Álló iPhone-okon (legalább 4) és legalább egy fekvő iPhone-on elindítja a
# tesztoldalt betöltő szimulátoros appot, megvárja a tesztoldal GÉPI
# riportját (VU_LAYOUT_REPORT_DIR), képernyőképet készít, majd a riportot
# az e2e/assert-simulator-report.mjs ellenőrzi. Bármely hiba → kilépési kód 1;
# a képernyőképek és riportok minden esetben megmaradnak (OUT alatt).
#
# Használat: e2e/ios-simulator-run.sh <App.app útvonal> <kimeneti könyvtár>

set -uo pipefail

APP_PATH="$1"
OUT="$2"
REPORTS="${VU_LAYOUT_REPORT_DIR:?VU_LAYOUT_REPORT_DIR hiányzik}"
BUNDLE_ID="hu.vedettsarok.utvonal"
MIN_PORTRAIT=4
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSERT="$REPO_ROOT/e2e/assert-simulator-report.mjs"

mkdir -p "$OUT" "$REPORTS"
xcrun simctl list devices available > "$OUT/available-devices.txt"

find_udid() {
  grep -F "    $1 (" "$OUT/available-devices.txt" | head -1 | grep -oE '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}' || true
}

wait_report() { # $1 = portrait|landscape, $2 = másodperc
  local deadline=$((SECONDS + $2))
  while [ $SECONDS -lt $deadline ]; do
    if grep -l "\"orientation\": \"$1\"" "$REPORTS"/*.json >/dev/null 2>&1; then return 0; fi
    sleep 2
  done
  return 1
}

start_app() { # $1 = UDID
  xcrun simctl boot "$1" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$1" -b
  xcrun simctl install "$1" "$APP_PATH"
  # Helyhozzáférés előre megadva (a tesztoldal amúgy is fix teszthelyet használ).
  xcrun simctl privacy "$1" grant location "$BUNDLE_ID" || true
  xcrun simctl location "$1" set 47.4979,19.0544 || true
  # Az értesítési engedélyt a simctl nem tudja előre megadni; a kérést a natív
  # navigációs start váltaná ki, amit a tesztoldal autostart módban elkülönít
  # (lásd Harness.tsx isolateNativeNavigationCalls) — így nem jelenik meg.
  xcrun simctl launch "$1" "$BUNDLE_ID"
}

collect() { # $1 = név, $2 = UDID, $3 = tájolás
  local dest="$OUT/reports/$1-$3"
  mkdir -p "$dest"
  sleep 2
  xcrun simctl io "$2" screenshot "$OUT/$1-$3.png" || true
  cp "$REPORTS"/*.json "$dest"/ 2>/dev/null || true
}

FAIL=0
PORTRAIT=0
LANDSCAPE_DONE=0
LAST_UDID=""
LAST_NAME=""

for DEVICE in "iPhone SE (3rd generation)" "iPhone 16e" "iPhone 17" "iPhone Air" "iPhone 17 Pro" "iPhone 17 Pro Max" "iPhone 16" "iPhone 16 Pro Max"; do
  [ "$PORTRAIT" -ge "$MIN_PORTRAIT" ] && break
  UDID=$(find_udid "$DEVICE")
  if [ -z "$UDID" ]; then echo "Nem elérhető szimulátor: $DEVICE"; continue; fi
  NAME=$(echo "$DEVICE" | tr ' ()' '___')
  echo "=== ÁLLÓ: $DEVICE ($UDID) ==="
  rm -f "$REPORTS"/*.json
  start_app "$UDID"
  if ! wait_report portrait 180; then echo "HIBA: nem érkezett riport ($DEVICE, álló)"; FAIL=1; fi
  collect "$NAME" "$UDID" portrait
  node "$ASSERT" "$OUT/reports/$NAME-portrait" portrait "$DEVICE" || FAIL=1
  PORTRAIT=$((PORTRAIT + 1))
  LAST_UDID="$UDID"; LAST_NAME="$NAME"
  xcrun simctl shutdown "$UDID" || true
done

if [ "$PORTRAIT" -lt "$MIN_PORTRAIT" ]; then
  echo "HIBA: csak $PORTRAIT álló szimulátor futott (legalább $MIN_PORTRAIT kell)"; FAIL=1
fi

# --- FEKVŐ teszt: a Simulator alkalmazás felületén forgatunk (Device > Rotate Left). ---
if [ -n "$LAST_UDID" ]; then
  echo "=== FEKVŐ: $LAST_NAME ($LAST_UDID) ==="
  rm -f "$REPORTS"/*.json
  xcrun simctl boot "$LAST_UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$LAST_UDID" -b
  open -a Simulator --args -CurrentDeviceUDID "$LAST_UDID"
  sleep 10
  start_app "$LAST_UDID"
  if wait_report portrait 180; then
    osascript -e 'tell application "Simulator" to activate' || true
    sleep 2
    osascript -e 'tell application "System Events" to tell process "Simulator" to click menu item "Rotate Left" of menu "Device" of menu bar 1' \
      || osascript -e 'tell application "System Events" to key code 123 using command down' \
      || echo "Forgatás AppleScripttel nem sikerült"
    if wait_report landscape 90; then LANDSCAPE_DONE=1; else echo "HIBA: nem érkezett fekvő riport"; fi
  else
    echo "HIBA: a fekvő teszt előtti álló riport sem érkezett meg"
  fi
  collect "$LAST_NAME" "$LAST_UDID" landscape
  node "$ASSERT" "$OUT/reports/$LAST_NAME-landscape" landscape "$LAST_NAME" || FAIL=1
  [ "$LANDSCAPE_DONE" -eq 1 ] || FAIL=1
  xcrun simctl shutdown "$LAST_UDID" || true
else
  echo "HIBA: nincs eszköz a fekvő teszthez"; FAIL=1
fi

echo "Álló: $PORTRAIT, fekvő: $LANDSCAPE_DONE, eredmény: $([ $FAIL -eq 0 ] && echo SIKERES || echo HIBÁS)"
exit $FAIL
