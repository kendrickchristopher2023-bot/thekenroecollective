import { DEFAULT_FRAME_COLOR, FRAMES_ENABLED, getFrame } from "@/lib/event-frames";

/**
 * Renders the decorative frame layers for an invite hero. Purely decorative,
 * so it is hidden from assistive tech and never intercepts pointer events.
 *
 * `color` is the host-chosen frame color. When absent the frame falls back to
 * the card accent, which is how every pre-existing invite looked, so enabling
 * the color control changed nothing for events that never set one.
 */
export function InviteFrame({
  frame,
  accent,
  color,
}: {
  frame: string | undefined | null;
  accent: string;
  color?: string | null;
}) {
  const def = getFrame(frame);
  if (!FRAMES_ENABLED || def.layers.length === 0) return null;
  const paint = color || accent || DEFAULT_FRAME_COLOR;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      {def.layers.map((layer, i) => (
        <span key={i} className={layer.className} style={layer.style(paint)} />
      ))}
    </div>
  );
}
