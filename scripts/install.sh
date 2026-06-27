#!/usr/bin/env bash
# =============================================================================
# PXN Shield subscription page — installer
#
# Installs the custom 3X-UI subscription theme and (optionally) the live stats
# collector. Run from a clone of the repo as root:
#
#     sudo ./scripts/install.sh
#
# Flags:
#   --no-stats        Install only the page (skip the stats daemon).
#   --xui-dir PATH    3X-UI install dir       (default: /usr/local/x-ui)
#   --theme-dir PATH  Sub Theme Directory     (default: <xui-dir>/pxn_sub)
#   --iface NAME      Network interface for speed stats (default: auto)
#   --isp "NAME"      Force provider name shown on the page
#   --region "NAME"   Force region shown on the page
#   --no-geo          Disable the one-time external geo lookup
# =============================================================================
set -euo pipefail

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; DIM=$'\e[2m'; BLD=$'\e[1m'; RST=$'\e[0m'
info(){ printf "%s==>%s %s\n" "$GRN" "$RST" "$1"; }
warn(){ printf "%s!!%s %s\n" "$YLW" "$RST" "$1"; }
die(){ printf "%sxx%s %s\n" "$RED" "$RST" "$1" >&2; exit 1; }

# ---- args --------------------------------------------------------------------
WITH_STATS=1; XUI_DIR="/usr/local/x-ui"; THEME_DIR=""; IFACE="auto"
ISP=""; REGION=""; GEO_LOOKUP=1
while [ $# -gt 0 ]; do
  case "$1" in
    --no-stats) WITH_STATS=0;;
    --xui-dir) XUI_DIR="$2"; shift;;
    --theme-dir) THEME_DIR="$2"; shift;;
    --iface) IFACE="$2"; shift;;
    --isp) ISP="$2"; shift;;
    --region) REGION="$2"; shift;;
    --no-geo) GEO_LOOKUP=0;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) die "Unknown option: $1";;
  esac
  shift
done
[ -z "$THEME_DIR" ] && THEME_DIR="$XUI_DIR/pxn_sub"

[ "$(id -u)" -eq 0 ] || die "Please run as root (sudo)."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -f "$REPO_ROOT/index.html" ] || die "index.html not found next to scripts/ — run this from the repo clone."

info "3X-UI dir   : $XUI_DIR"
info "Theme dir   : $THEME_DIR"
[ -d "$XUI_DIR" ] || warn "3X-UI not found at $XUI_DIR — installing the theme anyway."

# ---- install the page --------------------------------------------------------
mkdir -p "$THEME_DIR"
if [ -f "$THEME_DIR/index.html" ]; then
  cp -f "$THEME_DIR/index.html" "$THEME_DIR/index.html.bak.$(date +%s)"
  info "Backed up existing index.html"
fi
install -m 644 "$REPO_ROOT/index.html" "$THEME_DIR/index.html"
info "Installed page -> $THEME_DIR/index.html"

# ---- install the stats daemon ------------------------------------------------
if [ "$WITH_STATS" -eq 1 ]; then
  STATUS_JSON="$THEME_DIR/status.json"
  install -m 755 "$REPO_ROOT/scripts/server_stats.sh" "$XUI_DIR/pxn_server_stats.sh"

  mkdir -p /etc/pxn-sub
  cat > /etc/pxn-sub/stats.env <<EOF
# PXN Shield stats collector config — edit then: systemctl restart pxn-sub-stats
OUTPUT="$STATUS_JSON"
INTERVAL=2
IFACE="$IFACE"
HISTORY_MAX=30
GEO_LOOKUP=$GEO_LOOKUP
ISP="$ISP"
REGION="$REGION"
EOF
  info "Wrote /etc/pxn-sub/stats.env"

  install -m 644 "$REPO_ROOT/scripts/pxn-sub-stats.service" /etc/systemd/system/pxn-sub-stats.service
  systemctl daemon-reload
  systemctl enable --now pxn-sub-stats.service >/dev/null 2>&1 || systemctl restart pxn-sub-stats.service
  sleep 3
  if systemctl is-active --quiet pxn-sub-stats.service; then
    info "Stats service running. status.json -> $STATUS_JSON"
  else
    warn "Stats service did not start. Check: journalctl -u pxn-sub-stats -n 40"
  fi
else
  info "Skipping stats daemon (--no-stats). Page will show ambient demo values."
fi

cat <<EOF

${BLD}Almost done — one manual step in the 3X-UI panel:${RST}
  1. Open  Panel Settings  ->  Subscription
  2. Set   ${BLD}Sub Theme Directory${RST}  =  ${GRN}$THEME_DIR${RST}
  3. Save, then restart the panel:   ${DIM}x-ui restart${RST}

${BLD}If the Server Monitor stays on demo values${RST}, the sub server isn't serving
status.json next to the page. Two fixes:
  - Serve ${DIM}$THEME_DIR/status.json${RST} at a URL on the same origin as the sub page
    (e.g. an nginx 'location' — see README), then set ${BLD}STATS_URLS${RST} in index.html
    to that absolute URL; or
  - Run with ${DIM}--no-stats${RST} to keep it page-only.

Manage the collector:
  ${DIM}systemctl status pxn-sub-stats   |   journalctl -u pxn-sub-stats -f${RST}
${GRN}Done.${RST}
EOF
