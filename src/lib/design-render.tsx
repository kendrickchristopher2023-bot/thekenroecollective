// SVG renderer for Design Studio templates.
// The same component is used for the editor preview, the public share page,
// and as the source for PDF/PNG export (rasterized via dom-to-image-ish path
// using a canvas + svg blob to avoid extra deps).
import type { DesignTemplate } from "./design-templates";
import { importChunk } from "@/lib/lazy-chunk";

type Content = Record<string, any>;

// ── Free-form layer ─────────────────────────────────────────
// Items live at `content.freeform[pageId]` so each page has its own canvas.
export type FreeformItem = {
  id: string;
  type: "text" | "emoji" | "image" | "rect";
  x: number; y: number; w: number; h: number;
  text?: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  src?: string;
  fill?: string;
  opacity?: number;
  rotate?: number;
};

export function getFreeformItems(content: Content, page: string): FreeformItem[] {
  const ff = content?.freeform;
  if (!ff) return [];
  const list = Array.isArray(ff) ? ff : ff[page];
  return Array.isArray(list) ? list : [];
}

// ── Placement + contrast helpers for new free-form items ────
// Apparel templates draw a shirt silhouette on an otherwise empty canvas, so a
// naive default position (60,60) lands OFF the garment where the item is
// effectively invisible. Every new item is placed inside this safe area.
export function freeformSafeArea(template: DesignTemplate): { x: number; y: number; w: number; h: number } {
  const { width: w, height: h } = template;
  if (template.kind === "apparel") {
    const cx = w / 2;
    const bodyW = 320;
    return { x: cx - bodyW / 2 + 30, y: 300, w: bodyW - 60, h: Math.max(120, h - 300 - 140) };
  }
  return { x: Math.round(w * 0.1), y: Math.round(h * 0.1), w: Math.round(w * 0.8), h: Math.round(h * 0.8) };
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 1;
  let s = m[1];
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Auto-contrasting ink for new text/emoji items: near-black on light garments
// and backgrounds, near-white on dark ones. A hardcoded "#111" default made new
// text invisible on any dark shirt or background.
export function freeformDefaultInk(template: DesignTemplate, content: Content): string {
  const base = template.kind === "apparel"
    ? (content?.shirt_color || "#FDF2F4")
    : ((content?.palette ?? template.palette)?.bg || "#FFFFFF");
  return luminance(String(base)) > 0.55 ? "#111111" : "#FFFFFF";
}


function FreeformGroup({ items, selectedId, defaultInk = "#111" }: { items: FreeformItem[]; selectedId?: string | null; defaultInk?: string }) {
  return (
    <g data-ff-layer="">
      {items.map((it) => {
        const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
        const transform = it.rotate ? `rotate(${it.rotate} ${cx} ${cy})` : undefined;
        const selected = selectedId === it.id;
        return (
          <g key={it.id} data-ff-id={it.id} transform={transform} style={{ cursor: "move" }}>
            {/* Invisible hit area: text/emoji glyphs are thin targets, so the
                whole item box must be grabbable for dragging. */}
            <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="transparent" />
            {it.type === "rect" && (
              <rect x={it.x} y={it.y} width={it.w} height={it.h} fill={it.fill ?? "#000"} opacity={it.opacity ?? 1} rx={4} />
            )}
            {it.type === "image" && it.src && (
              <image href={it.src} x={it.x} y={it.y} width={it.w} height={it.h} preserveAspectRatio="xMidYMid slice" opacity={it.opacity ?? 1} />
            )}
            {(it.type === "text" || it.type === "emoji") && (
              <text
                x={it.x + it.w / 2}
                y={it.y + it.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={it.color ?? defaultInk}
                fontFamily={it.fontFamily ?? "Inter, system-ui, sans-serif"}
                fontSize={it.fontSize ?? Math.max(12, Math.min(it.h * 0.7, it.w * 0.7))}
              >
                {it.text}
              </text>
            )}
            {selected && (
              <>
                <rect x={it.x} y={it.y} width={it.w} height={it.h} fill="none" stroke="#3B82F6" strokeWidth={1.5} strokeDasharray="4 3" pointerEvents="none" />
                <rect data-ff-handle="resize" x={it.x + it.w - 7} y={it.y + it.h - 7} width={14} height={14} fill="#3B82F6" style={{ cursor: "nwse-resize" }} />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

export function DesignSvg({
  template, content, page = "main", selectedFreeformId = null,
}: { template: DesignTemplate; content: Content; page?: string; selectedFreeformId?: string | null }) {
  const palette = content.palette ?? template.palette;
  const font = content.fontFamily ?? template.fontFamily;
  const { width: W, height: H } = template;

  // Background overlays (image + pattern). These are handed to the template
  // component as `bgOverlay` so it can place them itself: flat templates drop
  // them straight over the background rect, apparel templates clip them to the
  // garment silhouette so ink never spills onto the surrounding canvas.
  const bg = (content.background ?? {}) as {
    image?: string; fit?: "cover" | "contain" | "tile"; opacity?: number;
    pattern?: "none" | "dots" | "grid" | "diagonal"; patternColor?: string; patternOpacity?: number;
  };
  const overlays: any[] = [];
  if (bg.image) {
    if (bg.fit === "tile") {
      const tileId = `__bgtile_${page}`;
      const tile = Math.max(40, Math.round(W / 4));
      overlays.push(
        <defs key="__bgtile_defs">
          <pattern id={tileId} patternUnits="userSpaceOnUse" width={tile} height={tile}>
            <image href={bg.image} x={0} y={0} width={tile} height={tile} preserveAspectRatio="xMidYMid slice" />
          </pattern>
        </defs>,
      );
      overlays.push(<rect key="__bgtile_rect" x={0} y={0} width={W} height={H} fill={`url(#${tileId})`} opacity={bg.opacity ?? 1} />);
    } else {
      overlays.push(
        <image key="__bgimg" href={bg.image} x={0} y={0} width={W} height={H}
          preserveAspectRatio={bg.fit === "contain" ? "xMidYMid meet" : "xMidYMid slice"}
          opacity={bg.opacity ?? 1} />,
      );
    }
  }
  if (bg.pattern && bg.pattern !== "none") {
    const pc = bg.patternColor || "#000000";
    const po = bg.patternOpacity ?? 0.08;
    const pid = `__bgpat_${page}_${bg.pattern}`;
    let patEl: any = null;
    if (bg.pattern === "dots") {
      patEl = <pattern id={pid} patternUnits="userSpaceOnUse" width={24} height={24}>
        <circle cx={12} cy={12} r={1.6} fill={pc} opacity={po} />
      </pattern>;
    } else if (bg.pattern === "grid") {
      patEl = <pattern id={pid} patternUnits="userSpaceOnUse" width={32} height={32}>
        <path d="M 32 0 L 0 0 0 32" fill="none" stroke={pc} strokeWidth={0.6} opacity={po} />
      </pattern>;
    } else if (bg.pattern === "diagonal") {
      patEl = <pattern id={pid} patternUnits="userSpaceOnUse" width={14} height={14} patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={14} stroke={pc} strokeWidth={1} opacity={po} />
      </pattern>;
    }
    if (patEl) {
      overlays.push(<defs key={`${pid}_defs`}>{patEl}</defs>);
      overlays.push(<rect key={`${pid}_rect`} x={0} y={0} width={W} height={H} fill={`url(#${pid})`} />);
    }
  }

  const bgOverlay = overlays.length > 0 ? <>{overlays}</> : null;
  const topLayer = (
    <FreeformGroup items={getFreeformItems(content, page)} selectedId={selectedFreeformId} defaultInk={freeformDefaultInk(template, content)} />
  );
  const layers = { bgOverlay, topLayer };

  switch (template.id) {
    case "menu_editorial":
    case "menu_midnight":
      return <MenuSvg w={W} h={H} palette={palette} font={font} content={content} darkAccent={template.id === "menu_midnight"} {...layers} />;
    case "menu_book":
      return page === "cover"
        ? <MenuBookCoverSvg w={W} h={H} palette={palette} font={font} content={content} {...layers} />
        : <MenuSvg w={W} h={H} palette={palette} font={font} content={content} darkAccent={false} {...layers} />;
    case "package_onepager":
      return <PackageSvg w={W} h={H} palette={palette} font={font} content={content} logo={content.logo_url} {...layers} />;
    case "apparel_crest":
      return <ApparelCrestSvg w={W} h={H} content={content} font={font} page={page} {...layers} />;
    case "apparel_event":
      return page === "back"
        ? <ApparelBackSvg w={W} h={H} content={content} font={font} page={page} {...layers} />
        : <ApparelEventSvg w={W} h={H} content={content} font={font} page={page} {...layers} />;
    case "signage_welcome":
      return <SignageSvg w={W} h={H} palette={palette} font={font} content={content} {...layers} />;
    case "favor_tag":
      return <FavorSvg w={W} h={H} palette={palette} font={font} content={content} {...layers} />;
    case "thankyou_card":
      return <ThankYouSvg w={W} h={H} palette={palette} font={font} content={content} {...layers} />;
    default:
      return <svg viewBox={`0 0 ${W} ${H}`} width="100%" />;
  }
}


// ── Helpers ──────────────────────────────────────────────────
function wrap(text: string, max: number) {
  const words = (text ?? "").split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) { if (line) lines.push(line); line = w; }
    else line = (line ? line + " " : "") + w;
  }
  if (line) lines.push(line);
  return lines;
}

// ── Menu ─────────────────────────────────────────────────────
function MenuSvg({ w, h, palette, font, content, darkAccent, bgOverlay, topLayer }: any) {
  const courses: any[] = content.courses ?? [];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      {/* border */}
      <rect x={30} y={30} width={w - 60} height={h - 60} fill="none" stroke={palette.accent} strokeWidth={1} />
      {/* eyebrow */}
      <text x={w/2} y={110} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={14} letterSpacing={6}>
        {String(content.eyebrow ?? "").toUpperCase()}
      </text>
      {/* title */}
      <text x={w/2} y={180} textAnchor="middle" fill={palette.fg} fontFamily={font.display} fontStyle="italic" fontSize={64}>
        {content.title}
      </text>
      {/* subtitle */}
      <text x={w/2} y={215} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={14}>
        {content.subtitle}
      </text>
      {/* divider */}
      <line x1={w/2 - 40} x2={w/2 + 40} y1={245} y2={245} stroke={palette.accent} strokeWidth={1.5} />
      {/* courses */}
      {courses.map((c, i) => {
        const y = 300 + i * 90;
        const lines = wrap(c.desc ?? "", 48);
        const hasImg = !!c.iconUrl;
        const textX = hasImg || c.emoji ? 110 : 70;
        return (
          <g key={i}>
            {hasImg ? (
              <image href={c.iconUrl} x={70} y={y - 22} width={28} height={28} preserveAspectRatio="xMidYMid meet" />
            ) : null}
            <text x={textX} y={y} fill={palette.fg} fontFamily={font.display} fontSize={22}>
              {!hasImg && c.emoji ? c.emoji + " " : ""}{c.name}
            </text>
            {lines.map((ln, j) => (
              <text key={j} x={textX} y={y + 24 + j * 18} fill={palette.muted} fontFamily={font.body} fontSize={14} fontStyle="italic">{ln}</text>
            ))}
            {(c.badges ?? []).map((b: string, k: number) => (
              <g key={k} transform={`translate(${w - 70 - k*64}, ${y - 18})`}>
                <rect x={-50} y={0} width={50} height={22} rx={11} fill={darkAccent ? palette.accent : palette.fg} opacity={0.12} />
                <text x={-25} y={15} textAnchor="middle" fill={palette.fg} fontFamily={font.body} fontSize={10} letterSpacing={1}>{b.toUpperCase()}</text>
              </g>
            ))}
          </g>
        );
      })}
      <text x={w/2} y={h - 60} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={11} letterSpacing={3}>
        {String(content.footer ?? "").toUpperCase()}
      </text>
      {topLayer}
    </svg>
  );
}

// ── Package ──────────────────────────────────────────────────
function PackageSvg({ w, h, palette, font, content, logo, bgOverlay, topLayer }: any) {
  const tiers: any[] = content.tiers ?? [];
  const tierW = (w - 120) / Math.max(tiers.length, 1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      {logo ? <image href={logo} x={w - 120} y={40} width={80} height={60} preserveAspectRatio="xMidYMid meet" /> : null}
      <text x={60} y={90} fill={palette.fg} fontFamily={font.display} fontSize={48}>{content.title}</text>
      <text x={60} y={120} fill={palette.muted} fontFamily={font.body} fontSize={16}>{content.subtitle}</text>
      {content.hero_image ? (
        <image href={content.hero_image} x={60} y={150} width={w - 120} height={260} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <rect x={60} y={150} width={w - 120} height={260} fill={palette.accent} opacity={0.08} />
      )}
      {tiers.map((t, i) => {
        const x = 60 + i * tierW;
        return (
          <g key={i}>
            <rect x={x + 8} y={450} width={tierW - 16} height={h - 510} fill="none" stroke={palette.accent} strokeWidth={1} />
            <text x={x + tierW/2} y={490} textAnchor="middle" fill={palette.fg} fontFamily={font.display} fontSize={22}>{t.name}</text>
            <text x={x + tierW/2} y={520} textAnchor="middle" fill={palette.accent} fontFamily={font.body} fontSize={20}>{t.price}</text>
            {(t.includes ?? []).slice(0, 8).map((inc: string, j: number) => (
              <text key={j} x={x + 24} y={560 + j * 24} fill={palette.fg} fontFamily={font.body} fontSize={12}>• {inc}</text>
            ))}
          </g>
        );
      })}
      <text x={w/2} y={h - 30} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={11} letterSpacing={2}>
        {String(content.footer ?? "").toUpperCase()}
      </text>
      {topLayer}
    </svg>
  );
}

// ── Apparel ──────────────────────────────────────────────────
function ApparelCrestSvg({ w, h, content, font, page, bgOverlay, topLayer }: any) {
  const shirt = content.shirt_color || "#111827";
  const ink = content.ink_color || "#F5EFE6";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      {/* Tee silhouette */}
      <ShirtPath fill={shirt} w={w} h={h} />
      {bgOverlay ? (
        <>
          <defs>
            <clipPath id={`__shirtclip_${page ?? "main"}`}>
              <path d={shirtPathD(w, h)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#__shirtclip_${page ?? "main"})`}>{bgOverlay}</g>
        </>
      ) : null}
      {/* Crest */}
      <g transform={`translate(${w/2}, ${h/2 - 20})`}>
        <circle r={90} fill="none" stroke={ink} strokeWidth={2} />
        <circle r={78} fill="none" stroke={ink} strokeWidth={0.6} />
        <text y={-30} textAnchor="middle" fill={ink} fontFamily={font.body} fontSize={14} letterSpacing={4}>
          {String(content.top ?? "").toUpperCase()}
        </text>
        <text y={20} textAnchor="middle" fill={ink} fontFamily={font.display} fontSize={72} fontStyle="italic">{content.monogram}</text>
        <text y={60} textAnchor="middle" fill={ink} fontFamily={font.body} fontSize={12} letterSpacing={3}>
          {String(content.bottom ?? "").toUpperCase()}
        </text>
      </g>
      <text x={w/2} y={h - 90} textAnchor="middle" fill={ink} opacity={0.6} fontFamily={font.body} fontSize={11} letterSpacing={2}>
        {content.tagline}
      </text>
      {topLayer}
    </svg>
  );
}

function ApparelEventSvg({ w, h, content, font, page, bgOverlay, topLayer }: any) {
  const shirt = content.shirt_color || "#FDF2F4";
  const ink = content.ink_color || "#3A1419";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <ShirtPath fill={shirt} w={w} h={h} />
      {bgOverlay ? (
        <>
          <defs>
            <clipPath id={`__shirtclip_${page ?? "main"}`}>
              <path d={shirtPathD(w, h)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#__shirtclip_${page ?? "main"})`}>{bgOverlay}</g>
        </>
      ) : null}
      <g transform={`translate(${w/2}, ${h/2 - 30})`}>
        <text y={-20} textAnchor="middle" fill={ink} fontFamily={font.display} fontStyle="italic" fontSize={64}>{content.headline}</text>
        <text y={20} textAnchor="middle" fill={ink} fontFamily={font.body} fontSize={16} letterSpacing={3}>{String(content.sub ?? "").toUpperCase()}</text>
        <line x1={-60} x2={60} y1={40} y2={40} stroke={ink} strokeWidth={1} />
        <text y={65} textAnchor="middle" fill={ink} fontFamily={font.body} fontSize={14}>{content.date}</text>
        <text y={85} textAnchor="middle" fill={ink} opacity={0.7} fontFamily={font.body} fontSize={12} letterSpacing={2}>{String(content.place ?? "").toUpperCase()}</text>
      </g>
      {topLayer}
    </svg>
  );
}

// Simple tee silhouette path scaled to canvas. Exported as a `d` string so the
// same geometry can be reused as a clipPath for background art and patterns.
function shirtPathD(w: number, h: number) {
  const cx = w / 2;
  const top = 80;
  const shoulder = 200;
  const sleeveDrop = 200;
  const bodyW = 320;
  const bodyH = h - top - 120;
  return `M ${cx - shoulder / 2} ${top + 20}
          L ${cx - 70} ${top}
          Q ${cx} ${top + 30} ${cx + 70} ${top}
          L ${cx + shoulder / 2} ${top + 20}
          L ${cx + bodyW / 2 + 20} ${top + sleeveDrop / 2}
          L ${cx + bodyW / 2} ${top + sleeveDrop}
          L ${cx + bodyW / 2} ${top + bodyH}
          L ${cx - bodyW / 2} ${top + bodyH}
          L ${cx - bodyW / 2} ${top + sleeveDrop}
          L ${cx - bodyW / 2 - 20} ${top + sleeveDrop / 2} Z`;
}

function ShirtPath({ fill, w, h }: any) {
  return <path d={shirtPathD(w, h)} fill={fill} stroke="#00000020" strokeWidth={1} />;
}

// ── Signage ──────────────────────────────────────────────────
function SignageSvg({ w, h, palette, font, content, bgOverlay, topLayer }: any) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      <rect x={40} y={40} width={w - 80} height={h - 80} fill="none" stroke={palette.accent} strokeWidth={2} />
      <text x={w/2} y={180} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={18} letterSpacing={6}>
        {String(content.eyebrow ?? "").toUpperCase()}
      </text>
      <text x={w/2} y={h/2 - 20} textAnchor="middle" fill={palette.fg} fontFamily={font.display} fontStyle="italic" fontSize={88}>
        {content.headline}
      </text>
      <text x={w/2} y={h/2 + 40} textAnchor="middle" fill={palette.accent} fontFamily={font.body} fontSize={48}>{content.emoji}</text>
      <text x={w/2} y={h/2 + 100} textAnchor="middle" fill={palette.fg} fontFamily={font.body} fontSize={18}>{content.subline}</text>
      <text x={w/2} y={h - 100} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontStyle="italic" fontSize={14}>{content.footer}</text>
      {topLayer}
    </svg>
  );
}

// ── Favor tag ────────────────────────────────────────────────
function FavorSvg({ w, h, palette, font, content, bgOverlay, topLayer }: any) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      <circle cx={w/2} cy={60} r={20} fill="none" stroke={palette.accent} strokeWidth={2} />
      <text x={w/2} y={h/2 - 30} textAnchor="middle" fill={palette.accent} fontFamily={font.body} fontSize={48}>{content.emoji}</text>
      <text x={w/2} y={h/2 + 30} textAnchor="middle" fill={palette.fg} fontFamily={font.display} fontStyle="italic" fontSize={48}>{content.headline}</text>
      <text x={w/2} y={h/2 + 70} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={14}>{content.sub}</text>
      <text x={w/2} y={h - 60} textAnchor="middle" fill={palette.fg} fontFamily={font.body} fontSize={14} letterSpacing={2}>{content.signature}</text>
      {topLayer}
    </svg>
  );
}

// ── Thank-you ────────────────────────────────────────────────
function ThankYouSvg({ w, h, palette, font, content, bgOverlay, topLayer }: any) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      {content.photo ? (
        <image href={content.photo} x={40} y={40} width={w/2 - 60} height={h - 80} preserveAspectRatio="xMidYMid slice" />
      ) : (
        <rect x={40} y={40} width={w/2 - 60} height={h - 80} fill={palette.accent} opacity={0.1} />
      )}
      <text x={w/2 + 20} y={120} fill={palette.fg} fontFamily={font.display} fontStyle="italic" fontSize={42}>{content.headline}</text>
      {wrap(String(content.body ?? ""), 36).map((ln, i) => (
        <text key={i} x={w/2 + 20} y={180 + i * 26} fill={palette.fg} fontFamily={font.body} fontSize={16}>{ln}</text>
      ))}
      <text x={w/2 + 20} y={h - 80} fill={palette.muted} fontFamily={font.body} fontStyle="italic" fontSize={16}>{content.signature}</text>
      {topLayer}
    </svg>
  );
}

// ── Export helpers ───────────────────────────────────────────
// Browsers refuse to load remote references from inside an SVG that is being
// drawn into a canvas, so uploaded artwork (background images, logos, free-form
// images) would silently vanish from exports. Inline every remote href as a
// data URL on a throwaway clone first.
async function inlineRemoteImages(svgEl: SVGSVGElement): Promise<SVGSVGElement> {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  const nodes = Array.from(clone.querySelectorAll("image"));
  const cache = new Map<string, string>();
  await Promise.all(nodes.map(async (node) => {
    const href = node.getAttribute("href") || node.getAttribute("xlink:href") || "";
    if (!href || href.startsWith("data:")) return;
    try {
      let dataUrl = cache.get(href);
      if (!dataUrl) {
        const res = await fetch(href, { mode: "cors" });
        const blob = await res.blob();
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        cache.set(href, dataUrl);
      }
      node.setAttribute("href", dataUrl);
      node.removeAttribute("xlink:href");
    } catch {
      // Unreachable image: drop it rather than failing the whole export.
      node.remove();
    }
  }));
  return clone;
}

export async function exportSvgElementToPng(svgEl: SVGSVGElement, scale = 2): Promise<Blob> {
  const source = await inlineRemoteImages(svgEl);
  const xml = new XMLSerializer().serializeToString(source);
  const svgBlob = new Blob([`<?xml version="1.0"?>${xml}`], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = (e) => rej(e); img.src = url; });
    const vb = svgEl.viewBox.baseVal;
    const w = (vb.width || svgEl.clientWidth) * scale;
    const h = (vb.height || svgEl.clientHeight) * scale;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png", 0.95));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportSvgElementToPdf(svgEl: SVGSVGElement, filename: string) {
  return exportSvgElementsToPdf([svgEl], filename);
}

// Multi-page PDF — one page per SVG.
export async function exportSvgElementsToPdf(svgEls: SVGSVGElement[], filename: string) {
  const { jsPDF } = await importChunk(() => import("jspdf"));
  let pdf: any = null;
  for (const svgEl of svgEls) {
    const png = await exportSvgElementToPng(svgEl, 2);
    const dataUrl: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(png); });
    const vb = svgEl.viewBox.baseVal;
    const w = vb.width || svgEl.clientWidth;
    const h = vb.height || svgEl.clientHeight;
    const orientation = w >= h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: [w, h] });
    else pdf.addPage([w, h], orientation);
    pdf.addImage(dataUrl, "PNG", 0, 0, w, h);
  }
  pdf?.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/** Default bleed for print-shop output: 9pt = 0.125 inch. */
export const PRINT_BLEED_PT = 9;

/**
 * Crop (trim) marks at the four corners of a bleed-extended page. Shared by
 * the design studio's print-ready export and the thank-you card print kit so
 * every print-shop PDF we produce carries the same marks. The marks stop 2pt
 * short of the trim box so they never print inside the finished piece.
 */
export function drawCropMarks(pdf: any, bleedPt: number, trimW: number, trimH: number, label = true) {
  const pageW = trimW + bleedPt * 2;
  const pageH = trimH + bleedPt * 2;
  pdf.setDrawColor(0); pdf.setLineWidth(0.5);
  const xL = bleedPt, xR = bleedPt + trimW, yT = bleedPt, yB = bleedPt + trimH;
  pdf.line(0, yT, xL - 2, yT); pdf.line(xL, 0, xL, yT - 2);
  pdf.line(xR + 2, yT, pageW, yT); pdf.line(xR, 0, xR, yT - 2);
  pdf.line(0, yB, xL - 2, yB); pdf.line(xL, yB + 2, xL, pageH);
  pdf.line(xR + 2, yB, pageW, yB); pdf.line(xR, yB + 2, xR, pageH);
  if (label) {
    pdf.setFontSize(6); pdf.setTextColor(120);
    pdf.text(`Trim ${Math.round(trimW)}×${Math.round(trimH)}pt · Bleed ${bleedPt}pt`, bleedPt, pageH - 2);
  }
}

// Print-ready PDF — adds a bleed margin (default 9pt = 0.125") around each
// page plus crop marks at the four corners. Printers use the marks to align
// the trim cut after the press is run on the bleed-extended sheet.
export async function exportSvgElementsToPrintPdf(svgEls: SVGSVGElement[], filename: string, bleedPt = PRINT_BLEED_PT) {
  const { jsPDF } = await importChunk(() => import("jspdf"));
  let pdf: any = null;
  for (const svgEl of svgEls) {
    const png = await exportSvgElementToPng(svgEl, 2);
    const dataUrl: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(png); });
    const vb = svgEl.viewBox.baseVal;
    const trimW = vb.width || svgEl.clientWidth;
    const trimH = vb.height || svgEl.clientHeight;
    const pageW = trimW + bleedPt * 2;
    const pageH = trimH + bleedPt * 2;
    const orientation = pageW >= pageH ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: [pageW, pageH] });
    else pdf.addPage([pageW, pageH], orientation);
    pdf.addImage(dataUrl, "PNG", bleedPt, bleedPt, trimW, trimH);
    drawCropMarks(pdf, bleedPt, trimW, trimH);
  }
  pdf?.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

// ── Extra page renderers ────────────────────────────────────
function MenuBookCoverSvg({ w, h, palette, font, content, bgOverlay, topLayer }: any) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <rect x={0} y={0} width={w} height={h} fill={palette.bg} />
      {bgOverlay}
      <rect x={50} y={50} width={w - 100} height={h - 100} fill="none" stroke={palette.accent} strokeWidth={1.5} />
      <rect x={64} y={64} width={w - 128} height={h - 128} fill="none" stroke={palette.accent} strokeWidth={0.5} />
      {content.logo_url ? (
        <image href={content.logo_url} x={w/2 - 50} y={h/2 - 220} width={100} height={100} preserveAspectRatio="xMidYMid meet" />
      ) : null}
      <text x={w/2} y={h/2 - 80} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={14} letterSpacing={6}>
        {String(content.eyebrow ?? "").toUpperCase()}
      </text>
      <text x={w/2} y={h/2 + 10} textAnchor="middle" fill={palette.fg} fontFamily={font.display} fontStyle="italic" fontSize={84}>
        {content.title}
      </text>
      <line x1={w/2 - 60} x2={w/2 + 60} y1={h/2 + 50} y2={h/2 + 50} stroke={palette.accent} strokeWidth={1} />
      <text x={w/2} y={h/2 + 90} textAnchor="middle" fill={palette.muted} fontFamily={font.body} fontSize={14}>
        {content.subtitle}
      </text>
      {topLayer}
    </svg>
  );
}

function ApparelBackSvg({ w, h, content, font, page, bgOverlay, topLayer }: any) {
  const shirt = content.shirt_color || "#FDF2F4";
  const ink = content.ink_color || "#3A1419";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" width="100%">
      <ShirtPath fill={shirt} w={w} h={h} />
      {bgOverlay ? (
        <>
          <defs>
            <clipPath id={`__shirtclip_${page ?? "main"}`}>
              <path d={shirtPathD(w, h)} />
            </clipPath>
          </defs>
          <g clipPath={`url(#__shirtclip_${page ?? "main"})`}>{bgOverlay}</g>
        </>
      ) : null}
      <text x={w/2} y={h/2 - 30} textAnchor="middle" fill={ink} fontFamily={font.display} fontSize={140}>{content.back_number}</text>
      <text x={w/2} y={h/2 + 30} textAnchor="middle" fill={ink} fontFamily={font.body} fontSize={16} letterSpacing={6}>{String(content.back_text ?? "").toUpperCase()}</text>
      {topLayer}
    </svg>
  );
}
