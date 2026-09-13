/**
 * Combining finished pieces into a new one.
 *
 * What this screen does: lets the host pick two to four pieces they own and say
 * what to take from each. The words from one, the musical treatment from
 * another, the hook from a third.
 *
 * What it says plainly, before anything is spent: this records a NEW piece from
 * the combined instructions. It does not lift the singing out of one recording
 * and drop it onto another. The merge itself is free and can be rearranged as
 * often as the host likes.
 *
 * The same rules are enforced again on the server, which is where they matter:
 * only AI pieces this account owns, never an uploaded or linked track.
 */
import { useMemo, useState } from "react";
import { Layers, X } from "lucide-react";
import {
  COMBINE_PARTS,
  type CombinePart,
  type Ingredient,
  combineBrief,
  combineTitle,
  emptyBrief,
  validateCombine,
} from "@/lib/studio-combine";
import { songLengthLabel } from "@/lib/wall-soundtrack";
import type { StudioBrief } from "@/lib/studio-brief";

export type CombinablePiece = {
  id: string;
  title: string;
  kind: string;
  seconds: number;
  settings?: Record<string, unknown> | null;
  /** "studio" or "wall": pieces mirrored from a photo wall may have no brief. */
  origin?: string | null;
  /** Whether the arrangement of this piece was kept. */
  hasPlan?: boolean;
};

export type CombineSelection = { pieceId: string; parts: CombinePart[] };

/** The lyrics kept on a piece, if any. */
function lyricsOf(p: CombinablePiece): string {
  const v = p.settings?.["lyrics"];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Does this piece carry a full brief, or only the handful of settings a photo
 * wall track was made with? A wall piece has a genre and a mood and little
 * else, so taking "the musical treatment" from it would quietly produce
 * something unrelated. We say so instead.
 */
function hasFullBrief(p: CombinablePiece): boolean {
  const s = p.settings ?? {};
  return ["era", "vocalTexture", "structure", "instruments"].some((k) => k in s);
}

function ingredientOf(p: CombinablePiece, parts: CombinePart[]): Ingredient {
  const saved = (p.settings ?? {}) as Partial<StudioBrief>;
  return {
    pieceId: p.id,
    title: p.title,
    kind: p.kind,
    brief: { ...emptyBrief(), ...saved } as StudioBrief,
    lyrics: lyricsOf(p),
    parts,
  };
}

export function SoundCombinePanel({
  pieces,
  busy,
  onUse,
}: {
  pieces: CombinablePiece[];
  busy?: boolean;
  onUse: (input: {
    selection: CombineSelection[];
    brief: StudioBrief;
    lockedLyrics: string;
    title: string;
    credits: { label: string; from: string }[];
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<CombineSelection[]>([]);

  const byId = useMemo(() => new Map(pieces.map((p) => [p.id, p])), [pieces]);
  const ingredients = useMemo(
    () =>
      picked
        .map((s) => {
          const piece = byId.get(s.pieceId);
          return piece ? ingredientOf(piece, s.parts) : null;
        })
        .filter((x): x is Ingredient => !!x),
    [picked, byId],
  );
  const problems = useMemo(() => validateCombine(ingredients), [ingredients]);
  const preview = useMemo(
    () => (ingredients.length ? combineBrief(emptyBrief(), ingredients) : null),
    [ingredients],
  );

  if (pieces.length < 2) return null;

  function toggle(pieceId: string) {
    setPicked((prev) =>
      prev.some((p) => p.pieceId === pieceId)
        ? prev.filter((p) => p.pieceId !== pieceId)
        : prev.length >= 4
          ? prev
          : [...prev, { pieceId, parts: [] }],
    );
  }

  function togglePart(pieceId: string, part: CombinePart) {
    setPicked((prev) =>
      prev.map((p) =>
        p.pieceId === pieceId
          ? {
              ...p,
              parts: p.parts.includes(part)
                ? p.parts.filter((x) => x !== part)
                : [...p.parts, part],
            }
          : // A part may only come from one piece, so choosing it here clears it
            // everywhere else instead of failing validation a moment later.
            { ...p, parts: p.parts.filter((x) => x !== part) },
      ),
    );
  }

  /** Why a part cannot be taken from this piece, in plain words. */
  function blockedReason(p: CombinablePiece, part: CombinePart): string {
    if ((part === "words" || part === "refrain") && !lyricsOf(p)) {
      return "This one was made before we kept the words, so there are none to take.";
    }
    if ((part === "music" || part === "voice") && !hasFullBrief(p)) {
      return "This one came from a photo wall and only kept a genre and a mood, so there is no full treatment to take.";
    }
    return "";
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
      >
        <Layers className="h-4 w-4" aria-hidden /> Combine pieces you have made
      </button>
    );
  }

  return (
    <div className="mt-6 rounded-3xl border border-blossom/30 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blossom">
            Combine
          </p>
          <h3 className="mt-1 font-serif text-xl text-ink">Take the best of two or more</h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPicked([]);
          }}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-full px-3 text-sm text-ink/60 ring-1 ring-ink/15 hover:bg-ink/5"
        >
          <X className="h-4 w-4" aria-hidden /> Close
        </button>
      </div>

      <p className="mt-3 rounded-2xl bg-blossom/5 p-4 text-sm text-ink/75">
        This records a brand new piece from what you choose here. It does not cut the
        singing out of one recording and lay it over another, so the new one will sound
        like itself, not like a patchwork. Choosing and rearranging is free, and only the
        final recording costs anything.
      </p>

      <ul className="mt-4 space-y-3">
        {pieces.map((p) => {
          const sel = picked.find((x) => x.pieceId === p.id);
          const thin = !hasFullBrief(p) && !lyricsOf(p);
          return (
            <li
              key={p.id}
              className={`rounded-2xl border p-4 ${
                sel ? "border-blossom/40 bg-blossom/5" : "border-ink/10"
              }`}
            >
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={!!sel}
                  onChange={() => toggle(p.id)}
                  className="mt-1 h-4 w-4"
                />
                <span>
                  <span className="font-medium text-ink">{p.title}</span>{" "}
                  <span className="text-ink/50">
                    · {songLengthLabel(p.seconds)} ·{" "}
                    {p.kind === "poem" ? "Spoken word" : "Song"}
                  </span>
                  {thin ? (
                    <span className="mt-1 block text-xs text-amber-700">
                      Made before we kept the recipe, so there is very little here to take.
                    </span>
                  ) : null}
                </span>
              </label>

              {sel ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {COMBINE_PARTS.map((part) => {
                    const reason = blockedReason(p, part.key);
                    const on = sel.parts.includes(part.key);
                    return (
                      <button
                        key={part.key}
                        type="button"
                        disabled={!!reason}
                        title={reason || part.help}
                        onClick={() => togglePart(p.id, part.key)}
                        className={`min-h-[36px] rounded-full px-3 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                          on
                            ? "bg-blossom text-white"
                            : "text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
                        }`}
                      >
                        {part.label}
                      </button>
                    );
                  })}
                  {COMBINE_PARTS.some((part) => blockedReason(p, part.key)) ? (
                    <p className="w-full text-xs text-ink/50">
                      {COMBINE_PARTS.map((part) => blockedReason(p, part.key))
                        .filter(Boolean)
                        .filter((r, i, a) => a.indexOf(r) === i)
                        .join(" ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {preview && !problems.length ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">{combineTitle(ingredients)}</p>
          <ul className="mt-2 space-y-1 text-xs">
            {preview.credits.map((c) => (
              <li key={`${c.part}-${c.pieceId}`}>
                {c.label} from "{c.from}"
              </li>
            ))}
          </ul>
          {preview.lockedLyrics ? (
            <p className="mt-2 text-xs">
              The words are taken whole and will be sung exactly as they are.
            </p>
          ) : null}
        </div>
      ) : picked.length ? (
        <ul className="mt-4 space-y-1 text-sm text-amber-700">
          {problems.map((p) => (
            <li key={p.code}>· {p.message}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={!!problems.length || !preview || busy}
        onClick={() => {
          if (!preview) return;
          onUse({
            selection: picked.filter((p) => p.parts.length),
            brief: preview.brief,
            lockedLyrics: preview.lockedLyrics,
            title: combineTitle(ingredients),
            credits: preview.credits.map((c) => ({ label: c.label, from: c.from })),
          });
          setOpen(false);
        }}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        <Layers className="h-4 w-4" aria-hidden /> Load this combination
      </button>
    </div>
  );
}
