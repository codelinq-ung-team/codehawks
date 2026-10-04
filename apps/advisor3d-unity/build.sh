#!/usr/bin/env bash
# Builds the Quest APK with Unity in batch mode, then installs and starts it on a headset
# connected by USB (developer mode on). Needs Unity 6000.3.25f1 with Android Build Support,
# and a Unity account signed in through Unity Hub. See README.md.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
version="$(sed -n 's/^m_EditorVersion: //p' "$here/ProjectSettings/ProjectVersion.txt")"
UNITY="${UNITY:-/Applications/Unity/Hub/Editor/$version/Unity.app/Contents/MacOS/Unity}"
ADB="${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}"

if [ ! -x "$UNITY" ]; then
  echo "Unity $version was not found at $UNITY. Install it from Unity Hub with Android Build Support, or set UNITY." >&2
  exit 1
fi

"$UNITY" -batchmode -quit -projectPath "$here" -buildTarget Android \
  -executeMethod Advisor3D.EditorTools.Advisor3DBuild.BuildApk -logFile "$here/Logs/build.log" \
  || { echo "The build failed. The last lines of Logs/build.log:" >&2; tail -40 "$here/Logs/build.log" >&2; exit 1; }
echo "Built $here/Builds/advisor3d.apk"

if [ "${1:-}" = "--no-install" ]; then exit 0; fi
"$ADB" install -r "$here/Builds/advisor3d.apk"
"$ADB" shell monkey -p org.codehawks.advisor3d -c android.intent.category.LAUNCHER 1 >/dev/null
echo "Installed and started on the headset. It is also in the library under Unknown Sources."
