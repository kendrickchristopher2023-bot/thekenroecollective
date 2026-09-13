import { formatEventDate } from "@/lib/events-store";
import { withAlpha } from "@/lib/color-contrast";

/**
 * The invite hero's date/time block. Previously a single 12px all-caps line, so
 * the WHEN of the event was the least prominent thing on the page and the time
 * was missing entirely. This is the second voice in the hero after the title:
 * weekday as a ruled eyebrow, the date in the display serif, the time as a
 * tracked caption.
 *
 * Shared so the guest invite, the host preview, and the printable PDF cannot
 * drift apart.
 */
export function InviteDateBlock({
  date,
  timezone,
  textColor,
  font,
  className,
}: {
  /** Event date as stored: naive "YYYY-MM-DDTHH:MM". */
  date: string;
  timezone?: string;
  /** Host-chosen invite text color. Undefined = theme defaults. */
  textColor?: string;
  font?: string;
  className?: string;
}) {
  if (!date) return null;
  const d = formatEventDate(date, timezone);
  const rule = withAlpha(textColor, 0.25);

  return (
    <div className={className}>
      <p
        className="flex items-center justify-center gap-3 text-[13px] font-medium uppercase tracking-[0.28em]"
        style={{ color: withAlpha(textColor, 0.75) }}
      >
        <span
          className="h-px w-8 sm:w-12"
          aria-hidden="true"
          style={{ backgroundColor: rule ?? "hsl(var(--muted-foreground) / 0.3)" }}
        />
        {d.weekday}
        <span
          className="h-px w-8 sm:w-12"
          aria-hidden="true"
          style={{ backgroundColor: rule ?? "hsl(var(--muted-foreground) / 0.3)" }}
        />
      </p>
      <p
        className="mt-2 font-serif text-4xl leading-tight sm:text-5xl 2xl:text-6xl"
        style={{
          color: textColor,
          fontFamily: font ? `${font}, serif` : undefined,
        }}
      >
        {d.dateOnly}
      </p>
      <p
        className="mt-2 text-lg font-medium uppercase tracking-[0.16em] sm:text-xl"
        style={{ color: withAlpha(textColor, 0.8) }}
      >
        {d.timeWithZone}
      </p>

    </div>
  );
}

/**
 * The WHERE of the event, sized to match the date block. Guests with low
 * vision were squinting at a single 18px grey line; the venue now reads as
 * the hero's third voice with the street address on its own larger line.
 */
export function InviteWhereBlock({
  venue,
  address,
  textColor,
  font,
  className,
}: {
  venue?: string;
  address?: string;
  textColor?: string;
  font?: string;
  className?: string;
}) {
  if (!venue && !address) return null;
  return (
    <div className={className}>
      {venue ? (
        <p
          className="font-serif text-2xl leading-snug sm:text-3xl"
          style={{
            color: textColor,
            fontFamily: font ? `${font}, serif` : undefined,
          }}
        >
          {venue}
        </p>
      ) : null}
      {address ? (
        <p
          className="mt-1.5 text-base leading-relaxed sm:text-lg"
          style={{ color: withAlpha(textColor, 0.8) }}
        >
          {address}
        </p>
      ) : null}
    </div>
  );
}

