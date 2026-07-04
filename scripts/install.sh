#!/usr/bin/env bash
# =============================================================================
# PXN Shield subscription page — installer
#
# Installs the custom 3X-UI subscription theme and (optionally) a self-contained
# stats server that the page auto-discovers — no reverse proxy, no panel changes.
#
# One-liner (downloads everything):
#   bash <(curl -Ls https://raw.githubusercontent.com/NightRiderr77/PXN-SUB/main/scripts/install.sh)
# Or from a clone:
#   sudo ./scripts/install.sh
#
# How live stats reach the page: the stats server runs as its OWN process on its
# OWN port (default 8788) and serves status.json with CORS. It never touches
# 3X-UI, so it cannot break the panel. index.html auto-builds the URL from the
# page host + that port. It also writes status.json into the theme dir as a
# same-origin fallback.
#
# Flags:
#   --no-stats        Page only (no stats server).
#   --port N          Stats server port            (default: 8788)
#   --xui-dir PATH    3X-UI install dir            (default: /usr/local/x-ui)
#   --theme-dir PATH  Sub Theme Directory          (default: <xui-dir>/pxn_sub)
#   --iface NAME      Interface for speed stats    (default: auto)
#   --isp "NAME"      Force provider label
#   --region "NAME"   Force region label
#   --no-geo          Disable the one-time geo lookup
#   --cert PATH --key PATH   Serve stats over HTTPS with this cert/key
#   --no-tls          Force plain HTTP even if a panel cert is found
# =============================================================================
set -euo pipefail

RED=$'\e[31m'; GRN=$'\e[32m'; YLW=$'\e[33m'; DIM=$'\e[2m'; BLD=$'\e[1m'; RST=$'\e[0m'
info(){ printf "%s==>%s %s\n" "$GRN" "$RST" "$1"; }
warn(){ printf "%s!!%s %s\n" "$YLW" "$RST" "$1"; }
die(){ printf "%sxx%s %s\n" "$RED" "$RST" "$1" >&2; exit 1; }
fetch(){ if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
         elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"; else return 1; fi; }

# ---- args --------------------------------------------------------------------
WITH_STATS=1; PORT=8788; XUI_DIR="/usr/local/x-ui"; THEME_DIR=""; IFACE="auto"
ISP=""; REGION=""; GEO_LOOKUP=1; CERT=""; KEY=""; NO_TLS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --no-stats) WITH_STATS=0;;
    --port) PORT="$2"; shift;;
    --xui-dir) XUI_DIR="$2"; shift;;
    --theme-dir) THEME_DIR="$2"; shift;;
    --iface) IFACE="$2"; shift;;
    --isp) ISP="$2"; shift;;
    --region) REGION="$2"; shift;;
    --no-geo) GEO_LOOKUP=0;;
    --cert) CERT="$2"; shift;;
    --key) KEY="$2"; shift;;
    --no-tls) NO_TLS=1;;
    -h|--help) grep -E '^#( |$)' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
    *) die "Unknown option: $1";;
  esac
  shift
done
[ -z "$THEME_DIR" ] && THEME_DIR="$XUI_DIR/pxn_sub"
[ "$(id -u)" -eq 0 ] || die "Please run as root (sudo)."

# ---- locate source files (clone or download) ---------------------------------
REPO="${REPO:-NightRiderr77/PXN-SUB}"
BRANCH="${BRANCH:-main}"
RAW_BASE="https://raw.githubusercontent.com/$REPO/$BRANCH"
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo /nonexistent)"
if [ -f "$SCRIPT_DIR/../index.html" ]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  info "Using local files from $REPO_ROOT"
else
  command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die "curl or wget is required."
  REPO_ROOT="$(mktemp -d)"; trap 'rm -rf "$REPO_ROOT"' EXIT
  mkdir -p "$REPO_ROOT/scripts"
  info "Downloading files from $REPO@$BRANCH"
  for f in index.html scripts/pxn_stats.py scripts/pxn-sub-stats.service; do
    fetch "$RAW_BASE/$f" "$REPO_ROOT/$f" || die "Failed to download $f"
  done
fi

info "3X-UI dir : $XUI_DIR"
info "Theme dir : $THEME_DIR"
[ -d "$XUI_DIR" ] || warn "3X-UI not found at $XUI_DIR — installing the theme anyway."

# ---- install the page --------------------------------------------------------
mkdir -p "$THEME_DIR"
[ -f "$THEME_DIR/index.html" ] && cp -f "$THEME_DIR/index.html" "$THEME_DIR/index.html.bak.$(date +%s)" && info "Backed up existing index.html"
install -m 644 "$REPO_ROOT/index.html" "$THEME_DIR/index.html"
info "Installed page -> $THEME_DIR/index.html"

# ---- stats server ------------------------------------------------------------
if [ "$WITH_STATS" -eq 1 ]; then
  if ! command -v python3 >/dev/null 2>&1; then
    warn "python3 not found — trying to install it"
    if   command -v apt-get >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq python3
    elif command -v dnf     >/dev/null 2>&1; then dnf install -y python3
    elif command -v yum     >/dev/null 2>&1; then yum install -y python3
    fi
  fi
  command -v python3 >/dev/null 2>&1 || die "python3 is required for the stats server (or re-run with --no-stats)."

  STATUS_JSON="$THEME_DIR/status.json"
  install -m 755 "$REPO_ROOT/scripts/pxn_stats.py" "$XUI_DIR/pxn_stats.py"

  # auto-detect a TLS cert from the 3X-UI DB (via python3 — no sqlite3 CLI needed)
  # so the stats port matches an HTTPS sub page and avoids mixed-content blocks.
  if [ "$NO_TLS" -eq 0 ] && [ -z "$CERT" ] && [ -f /etc/x-ui/x-ui.db ]; then
    CK=$(python3 - <<'PY' 2>/dev/null || true
import sqlite3, os
db = "/etc/x-ui/x-ui.db"
def get(k):
    try:
        c = sqlite3.connect(db); r = c.execute("select value from settings where key=?", (k,)).fetchone(); c.close()
        return r[0] if r and r[0] else ""
    except Exception:
        return ""
for cf_k, kf_k in (("subCertFile","subKeyFile"), ("webCertFile","webKeyFile")):
    cf, kf = get(cf_k), get(kf_k)
    if cf and kf and os.path.exists(cf) and os.path.exists(kf):
        print(cf + "|" + kf); break
PY
)
    if [ -n "$CK" ]; then CERT="${CK%%|*}"; KEY="${CK##*|}"; info "Found panel TLS cert — stats server will serve HTTPS"; fi
  fi
  [ "$NO_TLS" -eq 1 ] && { CERT=""; KEY=""; }

  mkdir -p /etc/pxn-sub
  cat > /etc/pxn-sub/stats.env <<EOF
# PXN Shield stats server config — edit then: systemctl restart pxn-sub-stats
OUTPUT="$STATUS_JSON"
PORT=$PORT
INTERVAL=2
IFACE="$IFACE"
HISTORY_MAX=30
GEO_LOOKUP=$GEO_LOOKUP
ISP="$ISP"
REGION="$REGION"
CERT="$CERT"
KEY="$KEY"
THEME_HTML="$THEME_DIR/index.html"
EOF
  info "Wrote /etc/pxn-sub/stats.env"

  install -m 644 "$REPO_ROOT/scripts/pxn-sub-stats.service" /etc/systemd/system/pxn-sub-stats.service
  # ensure the output dir is writable despite ProtectSystem
  mkdir -p /etc/systemd/system/pxn-sub-stats.service.d
  printf "[Service]\nReadWritePaths=%s\n" "$THEME_DIR" > /etc/systemd/system/pxn-sub-stats.service.d/paths.conf

  # open the firewall port (best effort)
  if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "$PORT"/tcp >/dev/null 2>&1 && info "ufw: opened $PORT/tcp"
  fi
  if command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --state >/dev/null 2>&1; then
    firewall-cmd --add-port="$PORT"/tcp --permanent >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 && info "firewalld: opened $PORT/tcp"
  fi

  rm -f "$XUI_DIR/pxn_server_stats.sh"   # drop the stale bash collector from earlier installs
  systemctl daemon-reload
  systemctl enable pxn-sub-stats.service >/dev/null 2>&1 || true
  systemctl restart pxn-sub-stats.service   # RESTART (not just enable) so a changed ExecStart takes effect
  sleep 3
  if systemctl is-active --quiet pxn-sub-stats.service; then
    LOCAL_CHECK=$(curl -s -m 4 "http://127.0.0.1:$PORT/status.json" 2>/dev/null | head -c 40)
    if [ -n "$LOCAL_CHECK" ]; then
      info "Stats server live on port $PORT  ${DIM}(local check OK)${RST}"
    else
      warn "Service is active but port $PORT isn't answering yet — journalctl -u pxn-sub-stats -n 30"
    fi
  else
    warn "Stats server did not start. Check: journalctl -u pxn-sub-stats -n 40"
  fi
else
  info "Skipping stats server (--no-stats). Server Monitor will read '—'."
fi

cat <<EOF

${BLD}One manual step in the 3X-UI panel:${RST}
  1. Settings -> Subscription -> ${BLD}Sub Theme Directory${RST} = ${GRN}$THEME_DIR${RST}
  2. Save, then: ${DIM}x-ui restart${RST}

${BLD}How live stats reach the page (two channels, tried in order):${RST}
  1. ${BLD}Same-origin embed${RST} — the daemon writes the stats straight into your theme's
     index.html, so they travel with the page. No extra port, works behind any proxy/CDN,
     and never touches 3X-UI. ${BLD}Requires an ${DIM}x-ui restart${RST}${BLD} after step 2${RST} so the panel
     serves the fresh theme.
  2. ${BLD}Dedicated port${RST} ${DIM}$PORT${RST} — fallback if the panel caches the theme. Open port
     ${BLD}$PORT${RST} in your VPS provider's firewall. HTTPS sub page? The installer reuses your
     panel's TLS cert if found (else pass ${DIM}--cert ... --key ...${RST}). Behind Cloudflare, use a
     CF-supported HTTPS port (${DIM}--port 2096${RST}) or grey-cloud the record.
EOF
if [ "$WITH_STATS" -eq 1 ]; then cat <<EOF
  Verify on the server:  ${DIM}curl -s http://127.0.0.1:$PORT/status.json${RST}
EOF
fi
cat <<EOF
Manage: ${DIM}systemctl status pxn-sub-stats  |  journalctl -u pxn-sub-stats -f${RST}
${GRN}Done.${RST}
EOF
