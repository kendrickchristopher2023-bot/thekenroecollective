/**
 * "Make it longer" (and shorter), on any piece in the library.
 *
 * The order here is deliberate: the free step first, which says in plain words
 * whether the recording he already knows is kept or replaced, what the change
 * costs, and which words will be sung. Only then is there a compose button.
 * Nothing about the original piece changes either way.
 */
import { toUserMessage } from "@/lib/user-error";
import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2, Repeat } from "lucide-react";
import { lengthCompose, lengthPreview, setPieceLoop } from "@/lib/music-studio.functions";
import { GROW_MODES, LENGTH_CHOICES, type GrowMode } from "@/lib/studio-length";

type Preview = {
  route: "extend" | "rerender";
  promise: string;
  charge: { kind: string; amountCents: number; label: string; fullCents: number };
  locked: boolean;
  instrumental: boolean;
  newVerse: string;
  plan: { text: string; durationMs: number }[];
  addedSections: number;
  hasStoredPlan: boolean;
  loopHint: string | null;
  loopReady: boolean;
  mode: GrowMode;
};

function label(seconds: number): string {
  return seconds >= 60 ? `${seconds / 60} min` : `${seconds}s`;
}

export function SoundLengthPanel({
  pieceId,
  title,
  seconds,
  owner,
  onChanged,
}: {
  pieceId: string;
  title: string;
  seconds: number;
  owner: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<number>(
    LENGTH_CHOICES.find((s) => s > seconds) ?? LENGTH_CHOICES[0]!,
  );
  const [mode, setMode] = useState<GrowMode>("verse");
  const [verse, setVerse] = useState("");
  const [keepWords, setKeepWords] = useState(false);
  const [busy, setBusy] = useState<null | "preview" | "compose">(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loop, setLoop] = useState(false);

  const growing = target > seconds;

  const runPreview = async () => {
    setBusy("preview");
    setPreview(null);
    try {
      const out = (await lengthPreview({
        data: { pieceId, toSeconds: target, mode, keepWords, newVerse: verse },
      } as never)) as Preview;
      setPreview(out);
      setVerse(out.newVerse ?? "");
      setLoop(!!out.loopReady);
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't work that out just now."));
    } finally {
      setBusy(null);
    }
  };

  const runCompose = async () => {
    setBusy("compose");
    try {
      const out = (await lengthCompose({
        data: { pieceId, toSeconds: target, mode, keepWords, newVerse: verse },
      } as never)) as { route: string };
      toast.success(
        out.route === "extend"
          ? "Done. Your original recording was kept and the new music added."
          : "Done. The longer version is in your library, alongside the original.",
      );
      setPreview(null);
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't compose that."));
    } finally {
      setBusy(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
      >
        <Clock className="h-4 w-4" aria-hidden /> Change length
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-2xl border border-ink/10 bg-paper/60 p-4">
      <p className="text-sm font-medium text-ink">
        Change the length of “{title}”{" "}
        <span className="text-ink/50">· now {label(seconds)}</span>
      </p>
      <p className="mt-1 text-xs text-ink/60">
        Your current version always stays in your library. This makes a separate one.
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
          New length
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {LENGTH_CHOICES.filter((s) => s !== seconds).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTarget(s);
                setPreview(null);
              }}
              aria-pressed={target === s}
              className={`min-h-[40px] rounded-full px-4 text-sm ${
                target === s ? "bg-ink text-paper" : "text-ink/70 ring-1 ring-ink/15 hover:bg-ink/5"
              }`}
            >
              {label(s)}
              {s < seconds ? " (shorter)" : ""}
            </button>
          ))}
        </div>
      </fieldset>

      {growing ? (
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
            How should it grow?
          </legend>
          <div className="mt-2 space-y-2">
            {GROW_MODES.map((m) => (
              <label key={m.key} className="flex items-start gap-2 text-sm text-ink/80">
                <input
                  type="radio"
                  name={`grow-${pieceId}`}
                  checked={mode === m.key}
                  onChange={() => {
                    setMode(m.key);
                    setPreview(null);
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-ink">{m.label}</span>
                  <span className="block text-xs text-ink/55">{m.blurb}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={keepWords}
              onChange={(e) => {
                setKeepWords(e.target.checked);
                setPreview(null);
              }}
            />
            Keep my words exactly as they are, grow the music only
          </label>
        </fieldset>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runPreview}
          disabled={busy !== null}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Show me what happens, free
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPreview(null);
          }}
          className="min-h-[44px] rounded-full px-4 text-sm text-ink/60 ring-1 ring-ink/15"
        >
          Cancel
        </button>
      </div>

      {preview ? (
        <div className="mt-4 space-y-3 border-t border-ink/10 pt-4">
          <p className="text-sm text-ink/80">{preview.promise}</p>

          {preview.loopHint ? (
            <div className="rounded-xl bg-blossom/5 p-3 text-sm text-ink/75">
              <p className="font-medium text-ink">There is a free way to do this</p>
              <p className="mt-1 text-xs">{preview.loopHint}</p>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await setPieceLoop({ data: { pieceId, loop: !loop } } as never);
                    setLoop(!loop);
                    onChanged();
                    toast.success(!loop ? "Set to loop under photographs" : "Looping turned off");
                  } catch {
                    toast.error("Couldn't save that.");
                  }
                }}
                className="mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
              >
                <Repeat className="h-4 w-4" aria-hidden />
                {loop ? "Looping is on" : "Loop this one instead, free"}
              </button>
            </div>
          ) : null}

          {!preview.hasStoredPlan ? (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              This piece does not have its arrangement saved, so it cannot be stretched from what
              is already there. Pieces composed from now on keep their arrangement, so this will
              work on them. For this one, composing again from your words is the only route, and
              the original stays in your library either way.
            </p>
          ) : null}



          {preview.newVerse && !preview.locked && !preview.instrumental ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.14em] text-ink/50">
                The new words, yours to change
              </label>
              <textarea
                value={verse}
                onChange={(e) => setVerse(e.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-ink/15 p-3 text-sm"
              />
            </div>
          ) : null}

          {preview.locked ? (
            <p className="text-xs text-ink/60">
              Your words are locked, so nothing new is sung. The music grows around them.
            </p>
          ) : null}

          <p className="text-sm font-medium text-ink">{preview.charge.label}</p>
          {preview.charge.kind === "difference" ? (
            <p className="text-xs text-ink/60">
              You only pay the difference between what you already paid and the longer price.
            </p>
          ) : null}

          {!preview.hasStoredPlan ? null : owner || preview.charge.amountCents === 0 ? (
            <button
              type="button"
              onClick={runCompose}
              disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-5 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy === "compose" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Compose {label(target)}
            </button>
          ) : (

            <p className="rounded-xl bg-ink/5 p-3 text-xs text-ink/70">
              Buying the difference isn't switched on yet. Everything else here is ready, and the
              price above is what it will charge.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
