# PXN Shield Subscription Page — Design & Architecture

_Date: 2026-06-28_

## Goal

A branded, premium subscription page for the PXN Stores LK 3X-UI panel that mirrors the
reference dashboard (subscription overview, data usage, server monitor, infrastructure)
with micro-interactions and animations — delivered as a **single self-contained
`index.html`** that drops into 3X-UI's *Sub Theme Directory*.

## Key constraints & decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Delivery | One `index.html`, all CSS + JS inline, no CDN | 3X-UI renders via Go `html/template`; a single file is the simplest drop-in and is airgap-safe. |
| Variables | Only the **documented** 3X-UI template vars | Avoids the binary-patching that 3X-SUB needs for its extra `{{ .base_path }}` / `{{ .result }}` vars. Stock panel compatible. |
| Theme | Monochrome / desaturated, white accent, single green "live" dot | Brand mandate — earlier violet-gradient directions were rejected. |
| Server stats | Progressive enhancement from optional `status.json` | The documented vars don't include CPU/RAM/network, so real data is layered on via an optional daemon; the page degrades gracefully. |
| Latency | Real `HEAD` request to the page URL, GET fallback | Works with zero backend; color-coded by RTT. |

## Data tiers (each degrades gracefully)

1. **Subscription + usage** — real, from `used/total/expire/sId/...`. Percent and remaining
   derived from the byte fields; expiry & online state computed client-side.
2. **Client→server latency** — real, measured in-browser.
3. **Server monitor + infrastructure** — real when the collector runs, else ambient demo
   values + configurable fallback provider/region.

## Stats mechanism (mirrors 3X-SUB, reimplemented)

- `scripts/server_stats.sh` runs as systemd service `pxn-sub-stats`, sampling `/proc/stat`,
  `/proc/meminfo`, `/proc/net/dev` every 2s and writing `status.json` atomically.
- JSON fields match what the page expects: `cpu`, `ram`, `net_in`, `net_out`, `isp`,
  `region`, `uptime`, `ts`, and a rolling `history` of `{t,c,r}` for the sparklines.
- The page polls `STATS_URLS` (same-origin candidates), caches the first that works, and
  falls back to demo mode if none respond. ISP/region come from a single cached geo lookup
  (or are forced via config), never per-tick.

## Rendering safety

All template values are injected through HTML `data-*` attributes (attribute context →
auto-escaped by `html/template`) and read via `dataset` in JS. No `{{ }}` tokens appear
inside the script/style, so Go's template engine never misparses the code. When the file is
opened outside the panel, unresolved `{{ }}` tokens are detected and realistic sample data is
substituted, so the page always previews cleanly.

## Visual system

- **Type:** data/numbers in a monospace stack (precision / infra feel); labels in uppercase
  tracked grotesk. No web-font download — system stacks only.
- **Surface:** near-black `#08090a` base, layered graphite cards with a hairline top-edge
  light; 18px radii.
- **Signature:** the hero usage ring — a hairline arc with a white→grey gradient stroke,
  drawn on load, paired with a giant mono readout.
- **Motion:** count-ups, ring/bar draw, live sparklines, sheen on the progress bar, hover
  lifts, preloader. All gated behind `prefers-reduced-motion`.

## Files

```
index.html                  whole page
scripts/server_stats.sh     collector
scripts/pxn-sub-stats.service
scripts/install.sh / uninstall.sh
docs/design.md              this file
```
