/**
 * PxnUsageDashboard — React port of the PXN Shield 3X-UI subscription page.
 *
 * Built as a MOCKUP component for marketing pages (e.g. pxnstores.lk): it renders
 * the exact same visual design as index.html, but takes all values as props
 * instead of reading Go template variables or polling a stats daemon.
 *
 * Self-contained on purpose:
 *   - No Tailwind, no shadcn, no icon library. Plain CSS + inline SVG.
 *   - All CSS is scoped under `.pxn-dash`, so it cannot leak into the host page.
 *   - The theme toggle only re-themes this component, never the whole document.
 *
 * Usage:
 *   <PxnUsageDashboard />                       // demo defaults
 *   <PxnUsageDashboard used="232.79GB" ... />   // override anything
 */
import React, { useEffect, useId, useState } from "react";
import { PXN_LOGO } from "./pxnLogo";

export interface PxnUsageDashboardProps {
  /* branding */
  brandName?: string;
  logoSrc?: string;
  /* hero */
  active?: boolean;
  planName?: string;
  planSub?: string;
  subId?: string;
  expiresOn?: string;
  expiresChip?: string;
  lastOnline?: string;
  online?: boolean;
  /* usage */
  used?: string;
  total?: string;
  usedPct?: number;
  upload?: string;
  download?: string;
  remaining?: string;
  /* server monitor */
  statsLive?: boolean;
  cpu?: number | null;
  memory?: number | null;
  uploadSpeed?: string;
  uploadUnit?: string;
  downloadSpeed?: string;
  downloadUnit?: string;
  cpuHistory?: number[];
  memHistory?: number[];
  upHistory?: number[];
  downHistory?: number[];
  /* infrastructure */
  provider?: string;
  region?: string;
  latencyMs?: number | null;
  /* links */
  subUrl?: string;
  guidesUrl?: string;
  supportUrl?: string;
  websiteUrl?: string;
  /* layout */
  maxWidth?: number;
  defaultTheme?: "dark" | "light";
  showThemeToggle?: boolean;
  animate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/* ------------------------------------------------------------------ helpers */

const RING_R = 86;
const RING_CIRC = 2 * Math.PI * RING_R;

/** Same sparkline maths as the HTML page. */
function sparkPaths(values: number[], max?: number) {
  if (!values || values.length < 2) return { line: "", area: "" };
  const w = 100;
  const h = 34;
  const mx = max ?? (Math.max(...values) * 1.25 || 1);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 2 - (Math.max(v, 0) / mx) * (h - 4);
    return [x, Number.isFinite(y) ? y : h - 2] as const;
  });
  const d = pts
    .map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(" ");
  return { line: d, area: `${d} L100 34 L0 34 Z` };
}

const fmtNum = (n: number | null | undefined) =>
  n == null ? "—" : n.toFixed(n < 10 ? 1 : 0);

/* ------------------------------------------------------------------- styles */

const CSS = `
.pxn-dash{
  --bg:#08090a; --bg-grain:#0a0b0d; --surface:#0d0e10; --surface-2:#131417; --surface-3:#191b1f;
  --line:rgba(255,255,255,.07); --line-strong:rgba(255,255,255,.12);
  --text:#f3f4f6; --text-dim:#b7bcc4; --muted:#83888f; --faint:#565b62;
  --accent:#ffffff; --live:#3ad17a; --warn:#e3b341; --bad:#e5534b;
  --radius:18px; --radius-sm:12px; --radius-xs:9px;
  --mono:ui-monospace,"SF Mono","JetBrains Mono","Cascadia Code","Segoe UI Mono","Roboto Mono",monospace;
  --sans:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  --ease:cubic-bezier(.22,.61,.36,1);

  position:relative;
  font-family:var(--sans);
  background:var(--bg);
  color:var(--text);
  line-height:1.5;
  letter-spacing:-.01em;
  padding:20px 18px 40px;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  background-image:
    radial-gradient(900px 500px at 85% -8%,rgba(255,255,255,.045),transparent 60%),
    radial-gradient(700px 600px at -10% 110%,rgba(255,255,255,.03),transparent 55%);
}
.pxn-dash[data-theme="light"]{
  --bg:#f3f3f1;--bg-grain:#efefec;--surface:#ffffff;--surface-2:#fafaf8;--surface-3:#f3f3f0;
  --line:rgba(0,0,0,.08);--line-strong:rgba(0,0,0,.14);
  --text:#0c0d0e;--text-dim:#33373c;--muted:#6a6f75;--faint:#9aa0a6;--accent:#0c0d0e;
}
.pxn-dash *,.pxn-dash *::before,.pxn-dash *::after{box-sizing:border-box;margin:0;padding:0}
.pxn-dash button{font:inherit;color:inherit;background:none;border:none}

.pxn-dash .wrap{max-width:var(--pxn-maxw,760px);margin:0 auto;display:flex;flex-direction:column;gap:18px}
.pxn-dash .num{font-family:var(--mono);font-feature-settings:"tnum" 1,"ss01" 1;letter-spacing:-.02em}
.pxn-dash .eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);font-weight:500}

/* header */
.pxn-dash .top{display:flex;align-items:center;justify-content:space-between;padding:4px 2px 2px}
.pxn-dash .brand{display:flex;align-items:center;gap:14px;min-width:0}
.pxn-dash .logo{width:46px;height:46px;flex:none;background-position:center;background-size:contain;background-repeat:no-repeat;filter:drop-shadow(0 2px 10px rgba(0,0,0,.45))}
.pxn-dash[data-theme="light"] .logo{filter:invert(1)}
.pxn-dash .brand-meta{display:flex;align-items:center;gap:12px;min-width:0}
.pxn-dash .brand-divider{width:1px;height:26px;background:var(--line-strong)}
.pxn-dash .brand-name{font-weight:600;font-size:15px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pxn-dash .icon-btn{width:42px;height:42px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);color:var(--text-dim);display:grid;place-items:center;cursor:pointer;transition:.25s var(--ease)}
.pxn-dash .icon-btn:hover{background:var(--surface-3);color:var(--text);transform:translateY(-1px);border-color:var(--line-strong)}
.pxn-dash .icon-btn:active{transform:translateY(0) scale(.96)}
.pxn-dash .icon-btn svg{width:18px;height:18px}

/* card shell */
.pxn-dash .card{position:relative;background:linear-gradient(180deg,var(--surface) 0%,var(--bg-grain) 140%);border:1px solid var(--line);border-radius:var(--radius);padding:22px;overflow:hidden}
.pxn-dash .card::before{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.16) 22%,rgba(255,255,255,.16) 78%,transparent);opacity:.7;pointer-events:none}
.pxn-dash .card-title{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.pxn-dash .card-title .eyebrow{font-size:11px}
.pxn-dash .dotgrid{position:absolute;top:18px;right:18px;width:120px;height:78px;opacity:.5;pointer-events:none;background-image:radial-gradient(currentColor 1px,transparent 1.4px);background-size:13px 13px;color:rgba(255,255,255,.13);-webkit-mask-image:linear-gradient(120deg,transparent,#000 70%);mask-image:linear-gradient(120deg,transparent,#000 70%)}

/* hero */
.pxn-dash .hero{display:grid;grid-template-columns:1fr auto;gap:26px 30px;align-items:start}
.pxn-dash .hero-main{min-width:0}
.pxn-dash .status-pill{display:inline-flex;align-items:center;gap:8px;padding:5px 11px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface-2);font-size:11px;letter-spacing:.12em;text-transform:uppercase;font-family:var(--mono);color:var(--text-dim)}
.pxn-dash .dot{width:7px;height:7px;border-radius:50%;background:var(--live);position:relative}
.pxn-dash .dot.live::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--live);animation:pxn-ping 2.4s var(--ease) infinite;opacity:0}
.pxn-dash .dot.off{background:var(--bad)}
@keyframes pxn-ping{0%{transform:scale(.6);opacity:.8}80%,100%{transform:scale(2.1);opacity:0}}
.pxn-dash .plan-name{font-size:clamp(24px,5.4vw,33px);font-weight:650;line-height:1.12;margin:16px 0 8px;letter-spacing:-.02em;overflow-wrap:anywhere}
.pxn-dash .plan-sub{color:var(--muted);font-size:13.5px;max-width:34ch}
.pxn-dash .meta-list{display:flex;flex-direction:column;gap:14px;margin-top:22px}
.pxn-dash .meta{display:flex;align-items:center;gap:13px}
.pxn-dash .meta-ic{width:40px;height:40px;border-radius:11px;border:1px solid var(--line);background:var(--surface-2);display:grid;place-items:center;color:var(--text-dim);flex:none}
.pxn-dash .meta-ic svg{width:18px;height:18px}
.pxn-dash .meta-body{min-width:0}
.pxn-dash .meta-k{font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.pxn-dash .meta-v{font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.pxn-dash .meta-v .id{font-family:var(--mono);font-size:12.5px;color:var(--text-dim);max-width:230px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pxn-dash .mini-copy{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:transparent;color:var(--muted);display:grid;place-items:center;cursor:pointer;transition:.2s var(--ease);flex:none}
.pxn-dash .mini-copy:hover{color:var(--text);border-color:var(--line-strong);background:var(--surface-2)}
.pxn-dash .mini-copy svg{width:13px;height:13px}
.pxn-dash .chip{font-family:var(--mono);font-size:10px;padding:2px 8px;border-radius:6px;border:1px solid var(--line-strong);color:var(--text-dim)}
.pxn-dash .chip.live{color:var(--live);border-color:rgba(58,209,122,.3);background:rgba(58,209,122,.07)}

/* ring */
.pxn-dash .ring-wrap{display:flex;flex-direction:column;align-items:center;gap:12px;align-self:center}
.pxn-dash .ring{position:relative;width:188px;height:188px}
.pxn-dash .ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.pxn-dash .ring .track{fill:none;stroke:var(--surface-3);stroke-width:9}
.pxn-dash .ring .prog{fill:none;stroke-width:9;stroke-linecap:round;transition:stroke-dashoffset 1.4s var(--ease);filter:drop-shadow(0 0 8px rgba(255,255,255,.25))}
.pxn-dash .ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.pxn-dash .ring-center .lbl{font-family:var(--mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.pxn-dash .ring-center .big{font-size:34px;font-weight:650;letter-spacing:-.02em}
.pxn-dash .ring-center .of{font-size:12px;color:var(--muted)}
.pxn-dash .ring-caption{font-family:var(--mono);font-size:11px;color:var(--muted);letter-spacing:.04em}

/* usage overview */
.pxn-dash .stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.pxn-dash .stat{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center}
.pxn-dash .stat-ic{width:46px;height:46px;border-radius:13px;border:1px solid var(--line);background:var(--surface-2);display:grid;place-items:center;color:var(--text-dim);transition:.3s var(--ease)}
.pxn-dash .stat-ic svg{width:20px;height:20px}
.pxn-dash .stat:hover .stat-ic{transform:translateY(-2px);border-color:var(--line-strong);color:var(--text)}
.pxn-dash .stat-k{font-family:var(--mono);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.pxn-dash .stat-v{font-size:18px;font-weight:600}
.pxn-dash .progress{margin-top:20px}
.pxn-dash .bar{height:8px;border-radius:6px;background:var(--surface-3);overflow:hidden;position:relative}
.pxn-dash .bar-fill{height:100%;width:0;border-radius:6px;background:linear-gradient(90deg,#7d8189,#ffffff);transition:width 1.4s var(--ease);position:relative}
.pxn-dash .bar-fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.5),transparent);transform:translateX(-100%);animation:pxn-sheen 3.2s var(--ease) infinite}
@keyframes pxn-sheen{0%{transform:translateX(-100%)}55%,100%{transform:translateX(220%)}}
.pxn-dash .bar-legend{display:flex;justify-content:space-between;margin-top:9px;font-family:var(--mono);font-size:11px;color:var(--muted)}

/* server monitor */
.pxn-dash .mon-row{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.pxn-dash .mon{background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:14px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:.3s var(--ease)}
.pxn-dash .mon:hover{border-color:var(--line-strong);transform:translateY(-2px)}
.pxn-dash .mon-top{display:flex;align-items:center;gap:8px;color:var(--muted)}
.pxn-dash .mon-top svg{width:15px;height:15px;flex:none}
.pxn-dash .mon-top .eyebrow{font-size:9px;letter-spacing:.12em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pxn-dash .mon-val{font-size:21px;font-weight:600}
.pxn-dash .mon-val .u{font-size:12px;color:var(--muted);font-weight:500;margin-left:2px}
.pxn-dash .spark{width:100%;height:34px;display:block;margin-top:2px}
.pxn-dash .spark path.line{fill:none;stroke:var(--text-dim);stroke-width:1.6;vector-effect:non-scaling-stroke}
.pxn-dash .spark path.area{stroke:none;opacity:.5}

/* infrastructure */
.pxn-dash .infra-row{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.pxn-dash .infra{display:flex;align-items:center;gap:13px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--radius-sm);padding:15px;transition:.3s var(--ease);min-width:0}
.pxn-dash .infra:hover{border-color:var(--line-strong);transform:translateY(-2px)}
.pxn-dash .infra-ic{width:42px;height:42px;border-radius:11px;border:1px solid var(--line);background:var(--surface);display:grid;place-items:center;color:var(--text-dim);flex:none}
.pxn-dash .infra-ic svg{width:19px;height:19px}
.pxn-dash .infra-body{min-width:0;flex:1}
.pxn-dash .infra-k{font-family:var(--mono);font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--muted);margin-bottom:3px}
.pxn-dash .infra-v{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pxn-dash .latency-btn{margin-left:auto;border:1px solid var(--line);background:transparent;color:var(--text-dim);width:34px;height:34px;border-radius:9px;display:grid;place-items:center;cursor:pointer;transition:.2s var(--ease);flex:none}
.pxn-dash .latency-btn:hover{color:var(--text);border-color:var(--line-strong);background:var(--surface)}
.pxn-dash .latency-btn svg{width:16px;height:16px}
.pxn-dash .lat-dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}

/* actions */
.pxn-dash .actions{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.pxn-dash .btn{display:flex;align-items:center;justify-content:center;gap:9px;padding:14px 16px;border-radius:13px;font-size:13.5px;font-weight:600;cursor:pointer;transition:.22s var(--ease);text-decoration:none;border:1px solid var(--line-strong);background:var(--surface-2);color:var(--text);letter-spacing:-.01em}
.pxn-dash .btn svg{width:17px;height:17px;flex:none}
.pxn-dash .btn:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.22)}
.pxn-dash .btn:active{transform:translateY(0) scale(.99)}
.pxn-dash .btn.primary{background:var(--accent);color:#08090a;border-color:transparent}
.pxn-dash .btn.primary:hover{filter:brightness(.92)}
.pxn-dash .btn.full{grid-column:1/-1}
.pxn-dash .btn.ok{background:rgba(58,209,122,.12);border-color:rgba(58,209,122,.4);color:var(--live)}

/* footer */
.pxn-dash .foot{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 8px;color:var(--faint);font-size:12.5px;padding:10px 12px 0;text-align:center}
.pxn-dash .foot-sep{color:var(--faint);opacity:.6}
.pxn-dash .foot-link{color:var(--text-dim);text-decoration:none;font-weight:600;transition:color .2s var(--ease)}
.pxn-dash .foot-link:hover{color:var(--text)}

/* toast (scoped to the component, not the page) */
.pxn-dash .toast{position:absolute;left:50%;bottom:26px;transform:translateX(-50%) translateY(140%);background:var(--surface-3);border:1px solid var(--line-strong);color:var(--text);padding:11px 18px;border-radius:11px;font-size:13px;font-weight:500;display:flex;align-items:center;gap:9px;box-shadow:0 12px 40px rgba(0,0,0,.5);transition:transform .4s var(--ease);z-index:5}
.pxn-dash .toast.show{transform:translateX(-50%) translateY(0)}
.pxn-dash .toast svg{width:16px;height:16px;color:var(--live)}

/* entrance */
.pxn-dash .reveal{opacity:0;transform:translateY(14px);animation:pxn-rise .7s var(--ease) forwards}
@keyframes pxn-rise{to{opacity:1;transform:none}}
.pxn-dash.no-anim .reveal{opacity:1;transform:none;animation:none}

@media(max-width:680px){
  .pxn-dash .hero{grid-template-columns:1fr;gap:8px}
  .pxn-dash .ring-wrap{order:-1;margin-bottom:6px}
  .pxn-dash .dotgrid{display:none}
  .pxn-dash .stat-row{grid-template-columns:repeat(2,1fr);gap:18px 14px}
  .pxn-dash .mon-row{grid-template-columns:repeat(2,1fr)}
  .pxn-dash .infra-row{grid-template-columns:1fr}
  .pxn-dash .actions{grid-template-columns:1fr}
  .pxn-dash .meta-v .id{max-width:62vw}
}
@media(prefers-reduced-motion:reduce){
  .pxn-dash *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}
  .pxn-dash .reveal{opacity:1;transform:none}
}
`;

/* -------------------------------------------------------------- component */

export default function PxnUsageDashboard({
  brandName = "PXN STORES LK",
  logoSrc = PXN_LOGO,
  active = true,
  planName = "www.pxnstores.lk",
  planSub = "Your subscription is active and working normally.",
  subId = "amyfckrhgfxsyloc50xt",
  expiresOn = "Jul 22, 2027",
  expiresChip = "396 days left",
  lastOnline = "2d ago",
  online = false,
  used = "232.79GB",
  total = "10.00TB",
  usedPct = 2.33,
  upload = "12.35GB",
  download = "220.45GB",
  remaining = "9.77TB",
  statsLive = true,
  cpu = 3.9,
  memory = 42,
  uploadSpeed = "149",
  uploadUnit = "KB/s",
  downloadSpeed = "260",
  downloadUnit = "KB/s",
  cpuHistory = [2.1, 3.4, 2.8, 4.6, 3.1, 5.2, 3.8, 4.4, 3.2, 4.9, 3.6, 3.9],
  memHistory = [38, 39, 41, 40, 42, 41, 43, 42, 44, 41, 42, 42],
  upHistory = [60, 110, 90, 170, 130, 210, 160, 240, 180, 120, 190, 149],
  downHistory = [80, 140, 210, 170, 260, 190, 300, 230, 280, 200, 240, 260],
  provider = "DigitalOcean, LLC",
  region = "Singapore",
  latencyMs = 34,
  subUrl = "https://in1.pxnv2ray.store:2096/sub/amyfckrhgfxsyloc50xt",
  guidesUrl = "https://www.pxnstores.lk/v2ray/setup-guides",
  supportUrl = "https://wa.me/94761546544",
  websiteUrl = "https://pxnstores.lk",
  maxWidth = 760,
  defaultTheme = "dark",
  showThemeToggle = true,
  animate = true,
  className = "",
  style,
}: PxnUsageDashboardProps) {
  const uid = useId().replace(/:/g, "");
  const ringGrad = `pxn-ring-${uid}`;
  const sparkGrad = `pxn-spark-${uid}`;

  const [theme, setTheme] = useState<"dark" | "light">(defaultTheme);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // trigger the ring / bar draw-in after first paint
  useEffect(() => {
    const t = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const pct = Math.max(0, Math.min(usedPct, 100));
  const dashOffset = mounted ? RING_CIRC * (1 - pct / 100) : RING_CIRC;
  const pctLabel = pct < 10 ? pct.toFixed(1) : pct.toFixed(0);

  const cpuSpark = sparkPaths(cpuHistory, 100);
  const memSpark = sparkPaths(memHistory, 100);
  const upSpark = sparkPaths(upHistory);
  const downSpark = sparkPaths(downHistory);

  const latColor =
    latencyMs == null
      ? "var(--faint)"
      : latencyMs < 150
      ? "var(--live)"
      : latencyMs < 400
      ? "var(--warn)"
      : "var(--bad)";

  async function copy(text: string, msg: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked — still show feedback in the mockup */
    }
    setToast(msg);
  }

  return (
    <div
      className={`pxn-dash${animate ? "" : " no-anim"}${className ? ` ${className}` : ""}`}
      data-theme={theme}
      style={{ ["--pxn-maxw" as string]: `${maxWidth}px`, ...style }}
    >
      <style>{CSS}</style>

      {/* shared gradients */}
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <linearGradient id={ringGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#6f747c" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <linearGradient id={sparkGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,.28)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
      </svg>

      <div className="wrap">
        {/* header */}
        <header className="top reveal" style={{ animationDelay: ".02s" }}>
          <div className="brand">
            <div
              className="logo"
              role="img"
              aria-label={brandName}
              style={{ backgroundImage: `url(${logoSrc})` }}
            />
            <div className="brand-meta">
              <div className="brand-divider" />
              <div className="brand-name">{brandName}</div>
            </div>
          </div>
          {showThemeToggle && (
            <button
              className="icon-btn"
              aria-label="Toggle theme"
              title="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          )}
        </header>

        {/* hero */}
        <section className="card hero reveal" style={{ animationDelay: ".08s" }}>
          <div className="dotgrid" />
          <div className="hero-main">
            <span className="status-pill">
              <span className={`dot ${active ? "live" : "off"}`} />
              <span>{active ? "Active" : "Disabled"}</span>
            </span>
            <h1 className="plan-name">{planName}</h1>
            <p className="plan-sub">{planSub}</p>

            <div className="meta-list">
              <div className="meta">
                <div className="meta-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" />
                    <line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" />
                  </svg>
                </div>
                <div className="meta-body">
                  <div className="meta-k">Subscription ID</div>
                  <div className="meta-v">
                    <span className="id num">{subId}</span>
                    <button className="mini-copy" aria-label="Copy subscription ID" onClick={() => copy(subId, "Subscription ID copied")}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <div className="meta">
                <div className="meta-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" />
                  </svg>
                </div>
                <div className="meta-body">
                  <div className="meta-k">Expires On</div>
                  <div className="meta-v">
                    <span>{expiresOn}</span>
                    <span className="chip">{expiresChip}</span>
                  </div>
                </div>
              </div>

              <div className="meta">
                <div className="meta-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 16 14" />
                  </svg>
                </div>
                <div className="meta-body">
                  <div className="meta-k">Last Online</div>
                  <div className="meta-v">
                    <span>{lastOnline}</span>
                    <span className={`chip${online ? " live" : ""}`}>{online ? "Online" : "Offline"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="ring-wrap">
            <div className="ring">
              <svg viewBox="0 0 200 200">
                <circle className="track" cx="100" cy="100" r={RING_R} />
                <circle
                  className="prog"
                  cx="100"
                  cy="100"
                  r={RING_R}
                  stroke={`url(#${ringGrad})`}
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="ring-center">
                <span className="lbl">Used</span>
                <span className="big num">{used}</span>
                <span className="of num">of {total}</span>
              </div>
            </div>
            <div className="ring-caption">{pctLabel}% used</div>
          </div>
        </section>

        {/* data usage overview */}
        <section className="card reveal" style={{ animationDelay: ".14s" }}>
          <div className="card-title"><span className="eyebrow">Data Usage Overview</span></div>
          <div className="stat-row">
            <div className="stat">
              <div className="stat-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V6" /><path d="m5 12 7-7 7 7" /><path d="M5 21h14" />
                </svg>
              </div>
              <div className="stat-k">Upload</div>
              <div className="stat-v num">{upload}</div>
            </div>
            <div className="stat">
              <div className="stat-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v13" /><path d="m19 12-7 7-7-7" /><path d="M5 3h14" />
                </svg>
              </div>
              <div className="stat-k">Download</div>
              <div className="stat-v num">{download}</div>
            </div>
            <div className="stat">
              <div className="stat-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9" /><path d="M12 12 21 3" /><path d="M16 3h5v5" />
                </svg>
              </div>
              <div className="stat-k">Used</div>
              <div className="stat-v num">{used}</div>
            </div>
            <div className="stat">
              <div className="stat-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12A10 10 0 1 1 12 2v10z" />
                </svg>
              </div>
              <div className="stat-k">Remaining</div>
              <div className="stat-v num">{remaining}</div>
            </div>
          </div>
          <div className="progress">
            <div className="bar">
              <div className="bar-fill" style={{ width: mounted ? `${pct}%` : 0 }} />
            </div>
            <div className="bar-legend">
              <span>{pctLabel}% Used</span>
              <span>{total} Total Limit</span>
            </div>
          </div>
        </section>

        {/* server monitor */}
        <section className="card reveal" style={{ animationDelay: ".2s" }}>
          <div className="card-title">
            <span className="eyebrow">Server Monitor</span>
            <span className={`chip${statsLive ? " live" : ""}`}>{statsLive ? "live" : "offline"}</span>
          </div>
          <div className="mon-row">
            <div className="mon">
              <div className="mon-top">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" />
                  <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
                </svg>
                <span className="eyebrow">CPU Usage</span>
              </div>
              <div className="mon-val"><span className="num">{fmtNum(cpu)}</span><span className="u">%</span></div>
              <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none">
                <path className="area" d={cpuSpark.area} fill={`url(#${sparkGrad})`} />
                <path className="line" d={cpuSpark.line} />
              </svg>
            </div>

            <div className="mon">
              <div className="mon-top">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="12" rx="2" />
                  <path d="M7 6v12M11 6v12M15 6v12M3 10h18M3 14h18" />
                </svg>
                <span className="eyebrow">Memory</span>
              </div>
              <div className="mon-val"><span className="num">{fmtNum(memory)}</span><span className="u">%</span></div>
              <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none">
                <path className="area" d={memSpark.area} fill={`url(#${sparkGrad})`} />
                <path className="line" d={memSpark.line} />
              </svg>
            </div>

            <div className="mon">
              <div className="mon-top">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V6" /><path d="m5 12 7-7 7 7" />
                </svg>
                <span className="eyebrow">Upload Speed</span>
              </div>
              <div className="mon-val"><span className="num">{uploadSpeed}</span><span className="u">{uploadUnit}</span></div>
              <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none">
                <path className="area" d={upSpark.area} fill={`url(#${sparkGrad})`} />
                <path className="line" d={upSpark.line} />
              </svg>
            </div>

            <div className="mon">
              <div className="mon-top">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v13" /><path d="m19 12-7 7-7-7" />
                </svg>
                <span className="eyebrow">Download Speed</span>
              </div>
              <div className="mon-val"><span className="num">{downloadSpeed}</span><span className="u">{downloadUnit}</span></div>
              <svg className="spark" viewBox="0 0 100 34" preserveAspectRatio="none">
                <path className="area" d={downSpark.area} fill={`url(#${sparkGrad})`} />
                <path className="line" d={downSpark.line} />
              </svg>
            </div>
          </div>
        </section>

        {/* infrastructure */}
        <section className="card reveal" style={{ animationDelay: ".26s" }}>
          <div className="card-title"><span className="eyebrow">Infrastructure Insights</span></div>
          <div className="infra-row">
            <div className="infra">
              <div className="infra-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" />
                  <line x1="7" y1="7" x2="7.01" y2="7" /><line x1="7" y1="17" x2="7.01" y2="17" />
                </svg>
              </div>
              <div className="infra-body">
                <div className="infra-k">Provider</div>
                <div className="infra-v">{provider}</div>
              </div>
            </div>

            <div className="infra">
              <div className="infra-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                </svg>
              </div>
              <div className="infra-body">
                <div className="infra-k">Region</div>
                <div className="infra-v">{region}</div>
              </div>
            </div>

            <div className="infra">
              <div className="infra-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
              </div>
              <div className="infra-body">
                <div className="infra-k">Client → Server</div>
                <div className="infra-v" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span className="lat-dot" style={{ background: latColor }} />
                  {latencyMs == null ? "Check" : <span className="num">{latencyMs} ms</span>}
                </div>
              </div>
              <button className="latency-btn" aria-label="Check latency">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* actions */}
        <section className="actions reveal" style={{ animationDelay: ".32s" }}>
          <button
            className={`btn primary full${copied ? " ok" : ""}`}
            onClick={() => {
              copy(subUrl, "Subscription link copied");
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <span>{copied ? "Copied!" : "Copy Subscription Link"}</span>
          </button>

          <a className="btn" href={guidesUrl} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Setup Guides &amp; Apps
          </a>

          <a className="btn" href={supportUrl} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.9 8.4 8.5 8.5 0 0 1-3.9-.9L3 20l1.1-4.1A8.38 8.38 0 0 1 3.2 12a8.5 8.5 0 0 1 8.4-8.5 8.38 8.38 0 0 1 9.4 8z" />
            </svg>
            WhatsApp Support
          </a>
        </section>

        <footer className="foot reveal" style={{ animationDelay: ".38s" }}>
          <span>© 2026 PXN STORES LK. All rights reserved.</span>
          <span className="foot-sep">·</span>
          <a className="foot-link" href={websiteUrl} target="_blank" rel="noopener noreferrer">
            pxnstores.lk
          </a>
        </footer>
      </div>

      <div className={`toast${toast ? " show" : ""}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>{toast ?? ""}</span>
      </div>
    </div>
  );
}
