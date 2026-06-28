#!/usr/bin/env bash
# =============================================================================
# PXN Shield subscription page — uninstaller
# Stops/removes the stats server and (optionally) the theme files.
#
#     sudo ./scripts/uninstall.sh [--theme-dir PATH] [--port N] [--keep-theme]
# =============================================================================
set -euo pipefail
GRN=$'\e[32m'; YLW=$'\e[33m'; RST=$'\e[0m'
info(){ printf "%s==>%s %s\n" "$GRN" "$RST" "$1"; }
warn(){ printf "%s!!%s %s\n" "$YLW" "$RST" "$1"; }

XUI_DIR="/usr/local/x-ui"; THEME_DIR=""; PORT=8788; KEEP_THEME=0
while [ $# -gt 0 ]; do
  case "$1" in
    --xui-dir) XUI_DIR="$2"; shift;;
    --theme-dir) THEME_DIR="$2"; shift;;
    --port) PORT="$2"; shift;;
    --keep-theme) KEEP_THEME=1;;
    *) ;;
  esac; shift
done
[ -z "$THEME_DIR" ] && THEME_DIR="$XUI_DIR/pxn_sub"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)."; exit 1; }

if systemctl list-unit-files 2>/dev/null | grep -q pxn-sub-stats; then
  systemctl disable --now pxn-sub-stats.service >/dev/null 2>&1 || true
  rm -f /etc/systemd/system/pxn-sub-stats.service
  rm -rf /etc/systemd/system/pxn-sub-stats.service.d
  systemctl daemon-reload
  info "Removed stats service"
fi
rm -f "$XUI_DIR/pxn_stats.py" "$XUI_DIR/pxn_server_stats.sh"
rm -rf /etc/pxn-sub
info "Removed stats server + config"

# close the firewall port (best effort)
if command -v ufw >/dev/null 2>&1; then ufw delete allow "$PORT"/tcp >/dev/null 2>&1 || true; fi
if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
  firewall-cmd --remove-port="$PORT"/tcp --permanent >/dev/null 2>&1 || true; firewall-cmd --reload >/dev/null 2>&1 || true
fi

if [ "$KEEP_THEME" -eq 0 ]; then
  rm -rf "$THEME_DIR"
  info "Removed theme dir $THEME_DIR"
  warn "Clear the 'Sub Theme Directory' field in the panel and run: x-ui restart"
else
  info "Kept theme dir $THEME_DIR (--keep-theme)"
fi
info "Done."
