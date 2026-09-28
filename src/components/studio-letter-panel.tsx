/**
 * Letters: the third kind of piece, beside Song and Poem.
 *
 * A letter is somebody's own words, read aloud by a studio voice. It is not
 * sung and it is not paraphrased. Two steps, always in this order:
 *
 *   1. Prepare the letter. Free. Nothing is spent, and the writer reads and
 *      edits every word before anything is recorded. Anything that looks like a
 *      name, a date or a quotation they never supplied is listed back to them
 *      and must be confirmed or removed.
 *   2. Read it aloud. This is the step that uses an audition or a paid credit.
 *
 * The two rules that matter live on the server, not here: no voice cloning of
 * any kind (the voice is looked up in a fixed list), and no invented facts (the
 * returned text is checked against the writer's own material again before a
 * single word is spoken).
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Play, Sparkles } from "lucide-react";
import { letterCompose, letterWrite } from "@/lib/studio-letters.functions";
import {
  LETTER_OCCASIONS,
  LETTER_PACES,
  LETTER_VOICES,
  countWords,
  fitNote,
  letterWordBudget,
  spokenSeconds,
  type LetterPace,
} from "@/lib/studio-letter";
import {
  ACCENTS,
  DELIVERIES,
  DELIVERY_FOR_OCCASION,
  recommendedVoice,
  samplePath,
  voicesFor,
  type AccentKey,
} from "@/lib/studio-voices";
import { AUDITION_MAX_SECONDS, money, priceLabelForSeconds } from "@/lib/music-studio-pricing";
import { STUDIO_LENGTHS } from "@/lib/music-studio.functions";
import { songLengthLabel } from "@/lib/wall-soundtrack";
import { downloadFileName } from "@/lib/sound-download-name";
import { toUserMessage } from "@/lib/user-error";

type Credit = { id: string; priceKey: string; seconds: number; amountCents: number };

type Prepared = {
  letter: string;
  spokenSeconds: number;
  possibleInventions: string[];
  printable: string;
};

const inputClass =
  "mt-1 w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink";

export function StudioLetterPanel({
  owner,
  credits,
  onSaved,
  eventId,
  onPiece,
}: {
  owner: boolean;
  credits: Credit[];
  onSaved?: () => void;
  /** Composing from an event: the finished letter is tagged to that event. */
  eventId?: string;
  /** The finished piece, so the caller can place it on a wall or a card. */
  onPiece?: (piece: { id: string; title: string; seconds: number; url: string | null }) => void;
}) {
  const [occasion, setOccasion] = useState("memorial");
  const [title, setTitle] = useState("");
  const [honoree, setHonoree] = useState("");
  const [fromName, setFromName] = useState("");
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [pace, setPace] = useState<LetterPace>("unhurried");
  const [paragraphPause, setParagraphPause] = useState(2);
  const [emphasis, setEmphasis] = useState("");
  // Remembered, so nobody re-picks a voice every single time.
  const [voice, setVoice] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("studio.letter.voice") : null;
    return saved || recommendedVoice("memorial", "en");
  });
  const [accent, setAccent] = useState<AccentKey | "">("");
  const [who, setWho] = useState<"" | "woman" | "man" | "younger">("");
  const [delivery, setDelivery] = useState<string>(DELIVERY_FOR_OCCASION["memorial"]!);
  const [sayName, setSayName] = useState("");
  const [language, setLanguage] = useState("en");
  const [seconds, setSeconds] = useState(60);
  const [creditId, setCreditId] = useState("");

  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [letter, setLetter] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [writing, setWriting] = useState(false);
  const [reading, setReading] = useState(false);
  const [done, setDone] = useState<{ title: string; url: string | null; printable: string } | null>(
    null,
  );

  const emphasisList = useMemo(
    () =>
      emphasis
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8),
    [emphasis],
  );
  const budget = letterWordBudget(seconds, pace);
  const audition = seconds <= AUDITION_MAX_SECONDS;
  const usableCredits = credits.filter((c) => c.seconds >= seconds);
  const needsCredit = !owner && !audition;

  function common() {
    return {
      occasion,
      draft,
      about,
      honoree,
      fromName,
      mustInclude,
      pace,
      paragraphPause,
      emphasis: emphasisList,
      seconds,
      voice,
      delivery,
      sayName,
      title,
      bed: "",
    };
  }

  const choices = voicesFor({ lang: language, accent, gender: who });
  const chosen = choices.find((v) => v.id === voice) ?? choices[0];

  function pickVoice(id: string) {
    setVoice(id);
    try {
      window.localStorage.setItem("studio.letter.voice", id);
    } catch {
      /* a private window must not break choosing a voice */
    }
  }

  async function prepare() {
    setWriting(true);
    try {
      const res = (await letterWrite({ data: common() })) as Prepared;
      setPrepared(res);
      setLetter(res.letter);
      setConfirmed(false);
      setDone(null);
      toast.success("Read it over. Nothing has been spent yet.");
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't prepare the letter."));
    } finally {
      setWriting(false);
    }
  }

  async function readAloud() {
    if (needsCredit && !creditId) {
      toast.error("Pick the length you paid for, or choose a short free audition.");
      return;
    }
    setReading(true);
    try {
      const res = (await letterCompose({
        data: {
          ...common(),
          letter,
          factsConfirmed: confirmed,
          ...(needsCredit ? { purchaseId: creditId } : {}),
          ...(eventId ? { eventId } : {}),
        },
      })) as {
        piece: { id: string; title: string; seconds: number; url: string | null };
        printable: string;
      };
      setDone({ title: res.piece.title, url: res.piece.url, printable: res.printable });
      onSaved?.();
      onPiece?.(res.piece);
      toast.success("Read and saved to your library.");
    } catch (e) {
      toast.error(toUserMessage(e, "Couldn't read that aloud."));
    } finally {
      setReading(false);
    }
  }

  function download(url: string, name: string) {
    const file = downloadFileName(name);
    const a = document.createElement("a");
    try {
      const u = new URL(url, window.location.origin);
      u.searchParams.set("download", file);
      a.href = u.toString();
    } catch {
      a.href = url;
    }
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const spoken = letter ? spokenSeconds(letter, pace) : 0;

  return (
    <div className="mt-6">
      <p className="rounded-2xl bg-blossom/5 p-4 text-sm text-ink/75">
        A letter is read aloud in your words, exactly as you approve them. Preparing and
        editing is free, and you see every word before anything is recorded. We never copy
        anyone's real voice, and we never let the studio put a name, a date or a quotation in
        your letter that you did not give us.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-ink/70">The moment</span>
          <select
            value={occasion}
            onChange={(e) => {
              setOccasion(e.target.value);
              const o = LETTER_OCCASIONS.find((x) => x.key === e.target.value);
              if (o) setPace(o.pace);
            }}
            className={inputClass}
          >
            {LETTER_OCCASIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Name this letter</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="For Grandma Ruthie"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Who it is for</span>
          <input
            value={honoree}
            onChange={(e) => setHonoree(e.target.value)}
            placeholder="Ruthie Kendrick"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Who it is from</span>
          <input
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            placeholder="Christopher"
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-ink/70">Your letter, in your own words</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 6000))}
          rows={7}
          className={`${inputClass} resize-y`}
          placeholder="Grandma, I am not in the room today, and that is the hardest part..."
        />
        <span className="mt-1 block text-xs text-ink/45">
          {countWords(draft)} words. About {budget} words fits the length you picked. If you
          write it yourself we only tighten it, never rewrite it.
        </span>
      </label>

      <label className="mt-4 block text-sm">
        <span className="text-ink/70">Or say what it is about and we will shape it</span>
        <textarea
          value={about}
          onChange={(e) => setAbout(e.target.value.slice(0, 2000))}
          rows={4}
          className={`${inputClass} resize-y`}
          placeholder="She raised five of us on the porch on Willow Street. Peach cobbler. Never missed a Sunday."
        />
      </label>

      <label className="mt-4 block text-sm">
        <span className="text-ink/70">Lines that must be in it, word for word</span>
        <textarea
          value={mustInclude}
          onChange={(e) => setMustInclude(e.target.value.slice(0, 1200))}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      </label>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="text-ink/70">Pace</span>
          <select
            value={pace}
            onChange={(e) => setPace(e.target.value as LetterPace)}
            className={inputClass}
          >
            {LETTER_PACES.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label} · {p.help}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">How it is delivered</span>
          <select
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
            className={inputClass}
          >
            {DELIVERIES.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label} · {d.help}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">Pause between paragraphs</span>
          <select
            value={paragraphPause}
            onChange={(e) => setParagraphPause(Number(e.target.value))}
            className={inputClass}
          >
            <option value={1}>A short breath</option>
            <option value={2}>A held pause</option>
            <option value={3}>A long silence</option>
          </select>
        </label>
        <div className="sm:col-span-3 rounded-xl border border-ink/10 bg-white/70 p-4">
          <p className="text-sm font-medium text-ink">Reading voice</p>
          <p className="mt-1 text-xs text-ink/60">
            Listen first. These are short recordings, so hearing them costs nothing.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-ink/70">Voice</span>
              <select
                value={who}
                onChange={(e) => setWho(e.target.value as typeof who)}
                className={inputClass}
              >
                <option value="">Any</option>
                <option value="woman">A woman</option>
                <option value="man">A man</option>
                <option value="younger">A younger voice</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink/70">Accent</span>
              <select
                value={accent}
                onChange={(e) => setAccent(e.target.value as AccentKey | "")}
                className={inputClass}
              >
                <option value="">Any</option>
                {ACCENTS.filter((a) => a.lang === (language === "es" || language === "fr" ? language : "en")).map(
                  (a) => (
                    <option key={a.key} value={a.key}>
                      {a.label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-ink/70">Language of the letter</span>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value);
                  setAccent("");
                  pickVoice(recommendedVoice(occasion, e.target.value));
                }}
                className={inputClass}
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </label>
          </div>
          <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
            {choices.map((v) => (
              <div
                key={v.id}
                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 ${
                  v.id === chosen?.id ? "bg-velvet/10" : ""
                }`}
              >
                <label className="flex flex-1 items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="letter-voice"
                    checked={v.id === chosen?.id}
                    onChange={() => pickVoice(v.id)}
                  />
                  <span>{v.label}</span>
                  {v.id === recommendedVoice(occasion, language) ? (
                    <span className="rounded bg-velvet/15 px-1.5 py-0.5 text-[11px] text-velvet">
                      Recommended
                    </span>
                  ) : null}
                </label>
                <audio controls preload="none" src={samplePath(v)} className="h-8 w-44" />
              </div>
            ))}
            {!choices.length ? (
              <p className="text-sm text-ink/60">
                No voice matches that combination. Widen one of the choices above.
              </p>
            ) : null}
          </div>
          <label className="mt-3 block text-sm">
            <span className="text-ink/70">Say the name like this, if it is easy to get wrong</span>
            <input
              value={sayName}
              onChange={(e) => setSayName(e.target.value)}
              placeholder="Ah-NEE-sah"
              className={inputClass}
            />
            <span className="mt-1 block text-xs text-ink/60">
              Only changes how it is spoken. The printed letter keeps the real spelling.
            </span>
          </label>
        </div>

        <label className="block text-sm sm:col-span-2">
          <span className="text-ink/70">Words to lean on, separated by commas</span>
          <input
            value={emphasis}
            onChange={(e) => setEmphasis(e.target.value)}
            placeholder="Ruthie, every Sunday, thank you"
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-ink/45">
            {emphasisList.length} of 8. These are said a little slower and a little stronger.
          </span>
        </label>
        <label className="block text-sm">
          <span className="text-ink/70">How long</span>
          <select
            value={seconds}
            onChange={(e) => {
              setSeconds(Number(e.target.value));
              setCreditId("");
            }}
            className={inputClass}
          >
            {STUDIO_LENGTHS.map((s: number) => (
              <option key={s} value={s}>
                {songLengthLabel(s)} · {s <= AUDITION_MAX_SECONDS ? "free" : priceLabelForSeconds(s, "letter")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        onClick={() => void prepare()}
        disabled={writing}
        className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full px-5 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5 disabled:opacity-60"
      >
        {writing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-4 w-4" aria-hidden />
        )}
        Prepare the letter, free
      </button>

      {prepared ? (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/50">
            Step two, read it over
          </p>
          <textarea
            value={letter}
            onChange={(e) => {
              setLetter(e.target.value);
              setConfirmed(false);
            }}
            rows={12}
            className={`${inputClass} resize-y font-serif text-base leading-relaxed`}
          />
          <p className="mt-1 text-xs text-ink/55">
            {countWords(letter)} words. {fitNote(letter, seconds, pace)}
          </p>

          {prepared.possibleInventions.length ? (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">
                These appear in the letter but not in anything you gave us
              </p>
              <p className="mt-1 text-xs">{prepared.possibleInventions.join(", ")}</p>
              <label className="mt-3 flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  I have read these and they are true. Otherwise edit them out above, and this
                  letter will not be read aloud until you do.
                </span>
              </label>
            </div>
          ) : (
            <p className="mt-3 text-xs text-emerald-700">
              Nothing in this letter is a fact you did not supply.
            </p>
          )}

          {needsCredit ? (
            usableCredits.length ? (
              <label className="mt-4 block text-sm">
                <span className="text-ink/70">Spend one of your paid pieces</span>
                <select
                  value={creditId}
                  onChange={(e) => setCreditId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Choose one</option>
                  {usableCredits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {songLengthLabel(c.seconds)} · {money(c.amountCents)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-4 rounded-2xl bg-ink/5 p-3 text-xs text-ink/65">
                This length is a paid piece. Pick a short free audition to hear the voice
                first, or buy a length on the Song tab and come back, your letter stays here.
              </p>
            )
          ) : null}

          <button
            type="button"
            onClick={() => void readAloud()}
            disabled={
              reading ||
              letter.trim().length < 20 ||
              (!!prepared.possibleInventions.length && !confirmed)
            }
            className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-blossom px-5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {reading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            Read it aloud{spoken ? ` · about ${spoken} seconds` : ""}
          </button>
        </div>
      ) : null}

      {done ? (
        <div className="mt-6 rounded-2xl border border-blossom/30 bg-blossom/5 p-4">
          <p className="font-serif text-lg text-ink">{done.title}</p>
          {done.url ? (
            <>
              <audio controls src={done.url} className="mt-3 w-full" />
              <button
                type="button"
                onClick={() => download(done.url as string, done.title)}
                className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-full px-4 text-sm font-medium text-blossom ring-1 ring-blossom/30 hover:bg-blossom/5"
              >
                <Download className="h-4 w-4" aria-hidden /> Download the reading
              </button>
            </>
          ) : null}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-blossom">
              The letter, to print or keep
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-serif text-sm text-ink/80">
              {done.printable}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}
