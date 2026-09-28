/**
 * The recipient's side of card music: every song, poem and letter on the card,
 * played one after another from the moment the card is opened. A lone song
 * repeats under the card as before; with several pieces each plays once and
 * the next one starts. Poems and letters offer their words to read instead.
 */
import { useRef, useState } from "react";
import { pieceLoops } from "@/lib/ecard-pieces";

export type RevealPiece = {
  id: string;
  kind: string;
  title: string;
  url: string | null;
  words: string | null;
};

type Tone = { ink: string; surface: string };

function introFor(kind: string): string {
  if (kind === "letter") return "A letter for you, read aloud";
  if (kind === "poem") return "A poem for you, read aloud";
  return "A song for you";
}

export function EcardPiecesPlayer({
  pieces,
  tone,
  onHeard,
}: {
  pieces: RevealPiece[];
  tone: Tone;
  onHeard: (pieceId: string) => void;
}) {
  const playable = pieces.filter((p) => p.url);
  const [index, setIndex] = useState(0);
  const [showWords, setShowWords] = useState(false);
  const heard = useRef(new Set<string>());
  const current = playable[index];
  if (!current) return null;

  const markHeard = () => {
    if (heard.current.has(current.id)) return;
    heard.current.add(current.id);
    onHeard(current.id);
  };
  const goTo = (i: number) => {
    setIndex(i);
    setShowWords(false);
  };
  const words = current.words?.trim() || null;

  return (
    <div className="mx-auto mb-4 w-full max-w-md">
      <p className="mb-1 text-sm" style={{ color: tone.ink, opacity: 0.75 }}>
        {playable.length > 1 ? `${index + 1} of ${playable.length} · ` : ""}
        {introFor(current.kind)}
        {current.title ? `: ${current.title}` : ""}
      </p>
      <audio
        key={current.id}
        src={current.url ?? undefined}
        autoPlay
        controls
        loop={pieceLoops(current.kind, playable.length)}
        onPlay={markHeard}
        onEnded={() => {
          if (index + 1 < playable.length) goTo(index + 1);
        }}
        className="w-full"
        aria-label={`Music for this card: ${current.title || "attached piece"}`}
      />
      {words ? (
        <>
          <button
            type="button"
            onClick={() => setShowWords((v) => !v)}
            className="mt-2 text-sm underline underline-offset-4"
            style={{ color: tone.ink, opacity: 0.75 }}
          >
            {showWords ? "Hide the words" : "Read the words instead"}
          </button>
          {showWords ? (
            <p
              className="mt-2 whitespace-pre-line rounded-2xl p-4 text-base leading-relaxed"
              style={{ background: tone.surface, color: tone.ink }}
            >
              {words}
            </p>
          ) : null}
        </>
      ) : null}
      {playable.length > 1 ? (
        <ol className="mt-3 space-y-1">
          {playable.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? "true" : undefined}
                className="w-full rounded-xl px-3 py-2 text-left text-sm"
                style={{
                  color: tone.ink,
                  background: i === index ? tone.surface : "transparent",
                  opacity: i === index ? 1 : 0.75,
                }}
              >
                {i + 1}. {p.title || introFor(p.kind)}
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
