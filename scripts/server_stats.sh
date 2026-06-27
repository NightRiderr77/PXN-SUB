#!/usr/bin/env bash
# =============================================================================
# PXN Shield — server stats collector
# Writes a status.json every INTERVAL seconds with live CPU / RAM / network
# and (optionally) ISP + region. The PXN subscription page reads this file to
# show the "Server Monitor" and "Infrastructure" panels with REAL data.
#
# Field names match what the page (and 3X-SUB) expect:
#   cpu       -> CPU usage percent
#   ram       -> Memory usage percent
#   net_in    -> Download speed in KB/s
#   net_out   -> Upload speed in KB/s
#   isp       -> Provider / ISP name (optional)
#   region    -> Region / city, country (optional)
#   uptime    -> Uptime in seconds
#   ts        -> Unix timestamp (seconds)
#   history   -> Rolling list of {t,c,r} (time, cpu, ram) for the sparklines
#
# Config is read from /etc/pxn-sub/stats.env (created by install.sh). All
# values have safe defaults so the script also runs standalone for testing.
# =============================================================================
set -u

CONF="${PXN_STATS_ENV:-/etc/pxn-sub/stats.env}"
[ -f "$CONF" ] && . "$CONF"

OUTPUT="${OUTPUT:-/usr/local/x-ui/pxn_sub/status.json}"
INTERVAL="${INTERVAL:-2}"
IFACE="${IFACE:-auto}"
HISTORY_MAX="${HISTORY_MAX:-30}"
ISP="${ISP:-}"
REGION="${REGION:-}"
GEO_LOOKUP="${GEO_LOOKUP:-1}"   # set 0 to disable the one-time external geo call

mkdir -p "$(dirname "$OUTPUT")" 2>/dev/null

# ---- pick the default network interface --------------------------------------
detect_iface() {
  if [ "$IFACE" != "auto" ] && [ -n "$IFACE" ]; then echo "$IFACE"; return; fi
  local i
  i=$(ip route 2>/dev/null | awk '/^default/{print $5; exit}')
  [ -z "$i" ] && i=$(ls /sys/class/net 2>/dev/null | grep -E '^(en|eth|ens|eno)' | head -n1)
  [ -z "$i" ] && i="eth0"
  echo "$i"
}
NET_IFACE="$(detect_iface)"

# ---- one-time geo lookup (cached) --------------------------------------------
# Only runs if ISP/REGION are not preset and GEO_LOOKUP=1. Uses a single call,
# never on every tick, so it is cheap and privacy-friendly.
geo_lookup() {
  [ -n "$ISP" ] && [ -n "$REGION" ] && return
  [ "$GEO_LOOKUP" != "1" ] && return
  command -v curl >/dev/null 2>&1 || return
  local j
  j=$(curl -fsS --max-time 5 "http://ip-api.com/json/?fields=isp,org,city,regionName,country" 2>/dev/null) || return
  [ -z "$j" ] && return
  local isp region city country
  isp=$(echo "$j" | sed -n 's/.*"isp":"\([^"]*\)".*/\1/p')
  [ -z "$isp" ] && isp=$(echo "$j" | sed -n 's/.*"org":"\([^"]*\)".*/\1/p')
  city=$(echo "$j" | sed -n 's/.*"city":"\([^"]*\)".*/\1/p')
  country=$(echo "$j" | sed -n 's/.*"country":"\([^"]*\)".*/\1/p')
  region=$(echo "$j" | sed -n 's/.*"regionName":"\([^"]*\)".*/\1/p')
  [ -z "$ISP" ] && ISP="$isp"
  if [ -z "$REGION" ]; then
    if [ -n "$city" ] && [ -n "$country" ]; then REGION="$city, $country"
    elif [ -n "$country" ]; then REGION="$country"
    else REGION="$region"; fi
  fi
}
geo_lookup

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# ---- CPU snapshot (jiffies) --------------------------------------------------
read_cpu() { awk '/^cpu /{idle=$5+$6; total=0; for(i=2;i<=NF;i++)total+=$i; print total" "idle}' /proc/stat; }

# ---- network snapshot (bytes) ------------------------------------------------
read_net() {
  awk -v ifc="$NET_IFACE" '$1 ~ ifc":"{gsub(/:/," "); print $2" "$10; found=1}
                           END{ if(!found) print "0 0" }' /proc/net/dev
}

# seed previous values
prev_cpu=($(read_cpu)); prev_net=($(read_net))
HIST=""

while true; do
  sleep "$INTERVAL"

  # CPU %
  cur_cpu=($(read_cpu))
  dt=$(( ${cur_cpu[0]} - ${prev_cpu[0]} ))
  di=$(( ${cur_cpu[1]} - ${prev_cpu[1]} ))
  if [ "$dt" -gt 0 ]; then
    cpu=$(awk -v t="$dt" -v i="$di" 'BEGIN{v=(1-i/t)*100; if(v<0)v=0; if(v>100)v=100; printf "%.1f", v}')
  else cpu="0.0"; fi
  prev_cpu=("${cur_cpu[@]}")

  # RAM %
  ram=$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{ if(t>0) printf "%.1f",(1-a/t)*100; else print "0.0" }' /proc/meminfo)

  # Network KB/s
  cur_net=($(read_net))
  rx=$(( ${cur_net[0]} - ${prev_net[0]} )); [ "$rx" -lt 0 ] && rx=0
  tx=$(( ${cur_net[1]} - ${prev_net[1]} )); [ "$tx" -lt 0 ] && tx=0
  net_in=$(awk -v b="$rx" -v s="$INTERVAL" 'BEGIN{printf "%.1f", b/1024/s}')
  net_out=$(awk -v b="$tx" -v s="$INTERVAL" 'BEGIN{printf "%.1f", b/1024/s}')
  prev_net=("${cur_net[@]}")

  ts=$(date +%s)
  uptime=$(awk '{printf "%d",$1}' /proc/uptime 2>/dev/null || echo 0)

  # rolling history of {t,c,r}
  entry="{\"t\":$ts,\"c\":$cpu,\"r\":$ram}"
  if [ -z "$HIST" ]; then HIST="$entry"; else HIST="$HIST,$entry"; fi
  cnt=$(printf '%s' "$HIST" | grep -o '{' | wc -l)
  if [ "$cnt" -gt "$HISTORY_MAX" ]; then
    HIST=$(printf '%s' "$HIST" | cut -d',' -f$((cnt-HISTORY_MAX+1))-)
  fi

  tmp="${OUTPUT}.tmp"
  {
    printf '{'
    printf '"cpu":%s,"ram":%s,"net_in":%s,"net_out":%s,' "$cpu" "$ram" "$net_in" "$net_out"
    printf '"isp":"%s","region":"%s",' "$(json_escape "$ISP")" "$(json_escape "$REGION")"
    printf '"iface":"%s","uptime":%s,"ts":%s,' "$(json_escape "$NET_IFACE")" "$uptime" "$ts"
    printf '"history":[%s]' "$HIST"
    printf '}'
  } > "$tmp" 2>/dev/null && mv -f "$tmp" "$OUTPUT" 2>/dev/null
  chmod 644 "$OUTPUT" 2>/dev/null
done
