#!/usr/bin/env python3
"""
PXN Shield — stats daemon (collector + CORS server).

Collects real CPU / RAM / network from /proc every INTERVAL seconds, plus a
one-time geo lookup for ISP + region, and serves the result as JSON with
permissive CORS so the subscription page can fetch it from any origin.

This runs as its OWN process on its OWN port. It never touches 3X-UI, so it
cannot affect or break the panel. The page (index.html) auto-discovers it at
  <page-protocol>//<page-host>:<PORT>/status.json
and also writes a status.json file (OUTPUT) for setups that serve the theme dir.

Pure Python 3 standard library — no pip installs required.

Config via environment (see /etc/pxn-sub/stats.env):
  OUTPUT       file to also write status.json to  (default theme dir)
  PORT         TCP port to serve on               (default 8788)
  INTERVAL     sample interval seconds            (default 2)
  IFACE        network interface or "auto"
  HISTORY_MAX  sparkline history length           (default 30)
  ISP, REGION  force these labels (skip geo lookup)
  GEO_LOOKUP   "1" to allow one external geo call (default 1)
  CERT, KEY    TLS cert/key paths -> serve HTTPS  (optional)
"""
import json, os, ssl, time, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

OUTPUT   = os.environ.get("OUTPUT", "/usr/local/x-ui/pxn_sub/status.json")
PORT     = int(os.environ.get("PORT", "8788"))
INTERVAL = float(os.environ.get("INTERVAL", "2"))
IFACE    = os.environ.get("IFACE", "auto")
HIST_MAX = int(os.environ.get("HISTORY_MAX", "30"))
ISP      = os.environ.get("ISP", "")
REGION   = os.environ.get("REGION", "")
GEO      = os.environ.get("GEO_LOOKUP", "1") == "1"
CERT     = os.environ.get("CERT", "")
KEY      = os.environ.get("KEY", "")

_state = {"json": b"{}"}
_lock = threading.Lock()


def detect_iface():
    if IFACE and IFACE != "auto":
        return IFACE
    try:
        with open("/proc/net/route") as f:
            for line in f.readlines()[1:]:
                p = line.split()
                if len(p) > 1 and p[1] == "00000000":
                    return p[0]
    except Exception:
        pass
    try:
        for n in sorted(os.listdir("/sys/class/net")):
            if n != "lo":
                return n
    except Exception:
        pass
    return "eth0"


NET = detect_iface()


def read_cpu():
    with open("/proc/stat") as f:
        v = list(map(int, f.readline().split()[1:]))
    idle = v[3] + (v[4] if len(v) > 4 else 0)
    return sum(v), idle


def read_mem():
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, rest = line.partition(":")
            info[k] = int(rest.split()[0])
    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    return (1 - avail / total) * 100 if total else 0.0


def read_net():
    try:
        with open("/proc/net/dev") as f:
            for line in f:
                name, _, rest = line.partition(":")
                if name.strip() == NET:
                    d = rest.split()
                    return int(d[0]), int(d[8])  # rx_bytes, tx_bytes
    except Exception:
        pass
    return 0, 0


def read_uptime():
    try:
        with open("/proc/uptime") as f:
            return int(float(f.read().split()[0]))
    except Exception:
        return 0


def geo_lookup():
    global ISP, REGION
    if (ISP and REGION) or not GEO:
        return
    try:
        req = urllib.request.Request(
            "http://ip-api.com/json/?fields=isp,org,city,country",
            headers={"User-Agent": "pxn-stats"})
        d = json.load(urllib.request.urlopen(req, timeout=5))
        if not ISP:
            ISP = d.get("isp") or d.get("org") or ""
        if not REGION:
            city, country = d.get("city", ""), d.get("country", "")
            REGION = ", ".join([x for x in (city, country) if x])
    except Exception:
        pass


def collector():
    geo_lookup()
    try:
        pc, pi = read_cpu()
    except Exception:
        pc, pi = 0, 0
    try:
        prx, ptx = read_net()
    except Exception:
        prx, ptx = 0, 0
    hist = []
    while True:
        time.sleep(INTERVAL)
        try:
            c, i = read_cpu()
            dt, di = c - pc, i - pi
            cpu = max(0.0, min(100.0, (1 - di / dt) * 100)) if dt > 0 else 0.0
            pc, pi = c, i
            ram = read_mem()
            rx, tx = read_net()
            net_in = max(0, rx - prx) / 1024 / INTERVAL
            net_out = max(0, tx - ptx) / 1024 / INTERVAL
            prx, ptx = rx, tx
            ts = int(time.time())
            hist.append({"t": ts, "c": round(cpu, 1), "r": round(ram, 1)})
            del hist[:-HIST_MAX]
            payload = {
                "cpu": round(cpu, 1), "ram": round(ram, 1),
                "net_in": round(net_in, 1), "net_out": round(net_out, 1),
                "isp": ISP, "region": REGION, "iface": NET,
                "uptime": read_uptime(), "ts": ts, "history": list(hist),
            }
            data = json.dumps(payload).encode()
            with _lock:
                _state["json"] = data
            try:
                os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
                tmp = OUTPUT + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(data)
                os.replace(tmp, OUTPUT)
            except Exception:
                pass
        except Exception:
            continue


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_HEAD(self):
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()

    def do_GET(self):
        with _lock:
            data = _state["json"]
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except Exception:
            pass

    def log_message(self, *a):
        pass  # stay quiet


def main():
    threading.Thread(target=collector, daemon=True).start()
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    if CERT and KEY and os.path.exists(CERT) and os.path.exists(KEY):
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        try:
            ctx.load_cert_chain(CERT, KEY)
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
            print("pxn-stats: serving HTTPS on :%d" % PORT, flush=True)
        except Exception as e:
            print("pxn-stats: TLS disabled (%s); serving HTTP on :%d" % (e, PORT), flush=True)
    else:
        print("pxn-stats: serving HTTP on :%d" % PORT, flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
