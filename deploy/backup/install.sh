#!/bin/bash
# Installs the nightly database backup (`python -m combo_publish backup`) as the LaunchAgent
# skin.combo.db-backup, at 03:00 every day, with this checkout's paths. An older job with the
# same label is replaced. Run it from anywhere: deploy/backup/install.sh
set -euo pipefail

label=skin.combo.db-backup
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
uv="$(command -v uv)" || { echo "uv is not on PATH" >&2; exit 1; }
docker="$(command -v docker)" || { echo "docker is not on PATH" >&2; exit 1; }
logs="$HOME/Library/Logs/combo-skin"
agents="$HOME/Library/LaunchAgents"
plist="$agents/$label.plist"
path="$(dirname "$uv"):$(dirname "$docker"):/usr/bin:/bin:/usr/sbin:/sbin"

for value in "$repo" "$uv" "$path" "$logs"; do
  case "$value" in
    *'|'* | *'&'* | *'<'*) echo "Refusing a path with | & or <: $value" >&2; exit 1 ;;
  esac
done

mkdir -p "$logs" "$agents"
sed -e "s|__UV__|$uv|g" -e "s|__REPO__|$repo|g" -e "s|__PATH__|$path|g" \
  -e "s|__LOG__|$logs/db-backup.log|g" "$here/$label.plist.template" > "$plist.new"
plutil -lint "$plist.new" > /dev/null

domain="gui/$(id -u)"
launchctl bootout "$domain/$label" 2> /dev/null || true
mv "$plist.new" "$plist"
launchctl bootstrap "$domain" "$plist"

echo "Installed $label: daily at 03:00, log in $logs/db-backup.log"
echo "Check it:   launchctl print $domain/$label"
echo "Run it now: launchctl kickstart $domain/$label"
