<div align="center">

# PXN Shield — Custom Subscription Page for 3X-UI

A single-file, self-contained subscription page for [3X-UI](https://github.com/MHSanaei/3x-ui),
styled in the **PXN Stores LK** brand. Monochrome, premium, animated — with a live
usage ring, real client→server latency, and an optional daemon for **real** server
monitoring (CPU / RAM / network) and infrastructure insights.

`index.html` · zero CDN · airgap-safe · drop into your *Sub Theme Directory*

</div>

---

## What you get

- **Subscription overview** — plan name, active/disabled state, last-online, expiry with a days-left chip, and the usage ring (used / total) driven by the real panel data.
- **Data Usage Overview** — upload, download, used, remaining, plus an animated progress bar.
- **Server Monitor** — CPU, memory, upload & download speed with live sparklines. **Real data only**: when the optional collector is installed the panel goes `live`; otherwise it shows `—` and an `offline` chip (never fabricated numbers).
- **Infrastructure Insights** — provider, region, and a **real** client→server latency check (HEAD request, color-coded green / amber / red).
- **Micro-interactions** — count-up numbers, ring stroke-draw, animated sparklines, copy-to-clipboard with feedback, hover lifts, preloader, light/dark toggle. Respects `prefers-reduced-motion`.
- **Branded actions** — Copy Subscription Link, Setup Guides & Apps, WhatsApp Support.

> Built only on 3X-UI's **documented** Go `html/template` variables, so it works on a
> stock panel with **no binary patching**. The live server stats are layered on top via
> progressive enhancement — if the data isn't there, the page still works.

---

## Quick start (page only — 2 minutes)

1. Copy `index.html` to a folder on your server, e.g. `/usr/local/x-ui/pxn_sub/`.
2. In the panel: **Settings → Subscription → Sub Theme Directory** → set it to that folder's absolute path.
3. Save, then restart the panel: `x-ui restart`.
4. Open any subscription link — you'll see the PXN page.

In this mode the **latency check is still real**; the Server Monitor shows `—` /
`offline` (no fake numbers) until you add the stats daemon below. You can optionally
set your real provider/region in the `FALLBACK_*` constants near the top of `index.html`.

---

## Full install (page + real server stats)

One line, as root on your VPS:

```bash
bash <(curl -Ls https://raw.githubusercontent.com/NightRider322/PXN-SUB/main/scripts/install.sh)
```

The installer auto-downloads the page and daemon when run this way. Pass flags after a `--`:

```bash
bash <(curl -Ls https://raw.githubusercontent.com/NightRider322/PXN-SUB/main/scripts/install.sh) --no-stats
```

Or clone and run it from the repo (same result):

```bash
git clone https://github.com/NightRider322/PXN-SUB.git
cd PXN-SUB
sudo ./scripts/install.sh
```

To update later, just run the one-liner again.

This will:

- copy `index.html` into the theme dir (default `/usr/local/x-ui/pxn_sub/`),
- install a small collector (`pxn_server_stats.sh`) + a systemd service `pxn-sub-stats`,
- write a `status.json` next to the page every 2s with real CPU / RAM / network (and a one-time geo lookup for ISP + region),
- print the one manual panel step (set the Sub Theme Directory).

Installer flags:

| Flag | Default | Purpose |
|------|---------|---------|
| `--no-stats` | off | Install the page only, skip the daemon |
| `--xui-dir PATH` | `/usr/local/x-ui` | 3X-UI install directory |
| `--theme-dir PATH` | `<xui-dir>/pxn_sub` | Where the page + status.json live |
| `--iface NAME` | `auto` | Network interface for speed stats |
| `--isp "NAME"` | geo lookup | Force the provider label |
| `--region "NAME"` | geo lookup | Force the region label |
| `--no-geo` | off | Disable the one-time external geo call |

Manage the collector:

```bash
systemctl status pxn-sub-stats
journalctl -u pxn-sub-stats -f
```

### Making `status.json` reachable from the page

The page fetches stats from these same-origin paths in order, then caches the one that works:

```
./status.json   ../status.json   sub_stats/status.json   assets/status.json
```

3X-UI serves the rendered template from the Sub Theme Directory; depending on your
version it may or may not serve sibling files like `status.json`. If the Server Monitor
stays on demo values:

- **Option A — serve it via your reverse proxy.** Point a location at the file and set
  `STATS_URLS` near the top of `index.html` to that absolute URL.

  ```nginx
  # serve the stats file on the same origin as your sub page
  location = /pxn/status.json {
      alias /usr/local/x-ui/pxn_sub/status.json;
      add_header Cache-Control "no-store";
  }
  ```
  then in `index.html`:
  ```js
  var STATS_URLS = ["https://your-domain/pxn/status.json"];
  ```

- **Option B — keep it page-only** with `--no-stats`.

---

## Customising

Everything lives at the top of the `<script>` block in `index.html`:

```js
var STATS_URLS = ["./status.json","../status.json","sub_stats/status.json","assets/status.json"];
var FALLBACK_PROVIDER = "";   // optional: your real provider, shown without the daemon ("" = "—")
var FALLBACK_REGION   = "";   // optional: your real region ("" = "—")
var POLL_MS = 2000;           // stats refresh interval
```

- **Brand name** — the header uses the panel's `{{ .subTitle }}` if set, else `PXN STORES LK`. Edit `#brandName` to hard-code it.
- **Links** — WhatsApp `https://wa.me/94761546544` and Setup Guides `https://www.pxnstores.lk/v2ray/setup-guides` are in the actions section. The WhatsApp button auto-uses the panel's `{{ .subSupportUrl }}` if configured.
- **Theme** — monochrome tokens are CSS variables under `:root` (and `[data-theme="light"]`). The accent is intentionally pure white; the only colour is the green "live" dot.

---

## 3X-UI template variables used

The page reads these via `data-*` attributes on the `#pxn-data` `<template>`:

`sId` · `enabled` · `download` · `upload` · `used` · `total` · `remained` ·
`downloadByte` · `uploadByte` · `totalByte` · `expire` (unix s) · `lastOnline` (unix ms) ·
`subUrl` · `subJsonUrl` · `subClashUrl` · `subTitle` · `subSupportUrl` · `datepicker`

Used (%) and remaining are derived from the byte fields; expiry date & days-left are computed
from `expire`; online state is computed from `lastOnline`.

> Open `index.html` directly (outside the panel) and it renders with realistic **sample data**
> automatically — handy for previewing and screenshots.

---

## Uninstall

```bash
sudo ./scripts/uninstall.sh            # removes daemon + theme
sudo ./scripts/uninstall.sh --keep-theme
```

Then clear the **Sub Theme Directory** field in the panel and run `x-ui restart`.

---

## Project layout

```
pxn-sub/
├─ index.html                     # the whole page (CSS + JS inline)
├─ scripts/
│  ├─ install.sh                  # installs page + optional stats daemon
│  ├─ uninstall.sh
│  ├─ server_stats.sh             # collector → status.json
│  └─ pxn-sub-stats.service       # systemd unit
├─ docs/design.md                 # design + architecture notes
└─ README.md
```

---

## Credits & licence

Brand: **PXN Stores LK**. Live-stats mechanism inspired by the approach used in
[3X-SUB](https://github.com/xLordGrim/3X-SUB) (read-only study of its `status.json`
collector pattern; no code copied). Licensed under the MIT License — see [LICENSE](LICENSE).
