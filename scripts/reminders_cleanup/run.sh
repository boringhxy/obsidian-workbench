#!/bin/sh
# Preview before explicitly using --apply; real reminders require macOS authorization.
set -eu
cleanup_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mode=${1:---preview}
case "$mode" in --preview|--apply|--restore|--restore-latest|--validate-only) ;; *) printf '%s\n' '不支持的模式'; exit 1;; esac
[ "$#" -eq 2 ] || { printf '%s\n' '用法：sh run.sh --preview/--apply targets.local.json；恢复可用--restore备份JSON'; exit 1; }
mkdir -p "$cleanup_root/.cleanup-build"
/usr/bin/xcrun swiftc -parse-as-library -module-cache-path "$cleanup_root/.cleanup-build/cache" -framework EventKit -framework CryptoKit -Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker "$cleanup_root/Info.plist" "$cleanup_root/Cleanup.swift" -o "$cleanup_root/.cleanup-build/cleanup-reminders"
exec "$cleanup_root/.cleanup-build/cleanup-reminders" "$mode" "$2"
