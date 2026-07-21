# React port — `PxnUsageDashboard`

A React/TypeScript component that renders the **exact** visual design of `index.html`,
for use as a product mockup on marketing pages (e.g. the "Live dashboards in your
account" section on pxnstores.lk).

Built for pasting straight into **Lovable** (or any React app):

- **No dependencies** — no Tailwind, no shadcn, no icon library. Plain CSS + inline SVG.
- **Scoped CSS** — every rule lives under `.pxn-dash`, so it cannot leak into the host page.
  The theme toggle re-themes only this component, never `document`.
- **Static/demo data** — takes everything as props. It does **not** read Go template
  variables and does **not** poll the stats daemon, so it's safe on a marketing site.

## Files

| File | Purpose |
|------|---------|
| `PxnUsageDashboard.tsx` | The component |
| `pxnLogo.ts` | PXN wordmark as a base64 data URI (keeps it self-contained) |

## Use it

```tsx
import PxnUsageDashboard from "@/components/PxnUsageDashboard";

export default function UsageSection() {
  return <PxnUsageDashboard />;   // renders with the demo defaults
}
```

Override anything:

```tsx
<PxnUsageDashboard
  planName="www.pxnstores.lk"
  used="232.79GB"
  total="10.00TB"
  usedPct={2.33}
  upload="12.35GB"
  download="220.45GB"
  remaining="9.77TB"
  expiresOn="Jul 22, 2027"
  expiresChip="396 days left"
  provider="DigitalOcean, LLC"
  region="Singapore"
  latencyMs={34}
/>
```

### Handy props

| Prop | Default | Notes |
|------|---------|-------|
| `maxWidth` | `760` | Inner column width in px |
| `showThemeToggle` | `true` | Hide it for a cleaner mockup |
| `animate` | `true` | `false` disables the entrance/draw-in animations |
| `defaultTheme` | `"dark"` | `"light"` for the light variant |
| `logoSrc` | embedded base64 | Pass `/logo.png` if you host it in `/public` |
| `statsLive` | `true` | `false` shows the `offline` chip |
| `cpu` / `memory` | `3.9` / `42` | Pass `null` to render `—` |
| `latencyMs` | `34` | `null` renders "Check" |
| `cpuHistory` etc. | demo arrays | Drive the sparklines |

## Embedding it as a scaled mockup

The component fills its container. To show it as a device-style card in a marketing
section, wrap and scale it:

```tsx
<div style={{ transform: "scale(.8)", transformOrigin: "top left" }}>
  <PxnUsageDashboard showThemeToggle={false} animate={false} maxWidth={720} />
</div>
```

## Keeping it in sync

This is a **visual copy** of `../index.html`. If you restyle the real subscription page,
mirror the change here — the CSS block in `PxnUsageDashboard.tsx` is a scoped, 1:1 port
of the `<style>` block in `index.html`.

> The numbers shown are illustrative demo values for marketing. The real page renders
> live panel data and shows `—` when no stats source is available.
