import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { curateEcardMontage, getEcardReveal, getPublicEcard } from "@/lib/ecards.functions";
import { getEcardMusic, markEcardMusicHeard } from "@/lib/music-studio.functions";
import { useQuery } from "@tanstack/react-query";
import {
  formatCountdown,
  useLocalDateTime,
  useRevealCountdown,
} from "@/components/ecard-countdown";
import { AddRevealToCalendarButton } from "@/components/add-to-calendar-button";

import { getEcardTheme } from "@/lib/ecard-themes";
import { ConfettiBurst } from "@/components/ecard-delight";
import { EcardMontage, type MontageCuration } from "@/components/ecard-montage";
import { ContributionMedia } from "@/components/ecard-media";
import type { RevealPayload } from "@/lib/ecards.schemas";
import { GlobalErrorFallback } from "@/components/global-error-fallback";

export const Route = createFileRoute("/r/$slug")({
  loader: ({ params }) => getEcardReveal({ data: { slug: params.slug } }),
  head: ({ loaderData }) => {
    const reveal = loaderData?.reveal;
    const title = reveal
      ? `${reveal.occasion} for ${reveal.recipient_name}`
      : "Your group card — The Kenroe Collective";
    const description = reveal
      ? `${reveal.contributions.length} messages collected for ${reveal.recipient_name}.`
      : "A group card is waiting. It opens on the reveal date.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  errorComponent: GlobalErrorFallback,
  notFoundComponent: () => (
    <div className="grid min-h-[60vh] place-items-center px-6 py-16 text-center">
      <div className="max-w-md">
        <h1 className="font-serif text-3xl text-ink">We couldn't find this card</h1>
        <p className="mt-3 text-base text-muted-foreground">
          The link may be incomplete or out of date. Ask whoever sent it to share it again.
        </p>
        <a
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-ink/15 px-6 py-2.5 text-sm font-medium text-ink hover:bg-ink/5"
        >
          Go to the home page
        </a>
      </div>
    </div>
  ),
  component: RevealPage,
});

function RevealPage() {
  const { slug } = Route.useParams();
  const { reveal } = Route.useLoaderData() as { reveal: RevealPayload | null };
  const theme = getEcardTheme(reveal?.theme);
  const curate = useServerFn(curateEcardMontage);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<"cards" | "montage">("cards");
  const [curation, setCuration] = useState<MontageCuration | null>(null);
  const [curating, setCurating] = useState(false);
  const [index, setIndex] = useState(0);
  const [keepsake, setKeepsake] = useState(false);

  const items = reveal?.contributions ?? [];

  // Music the organizer attached from Kenroe Sound Studio, if any. It starts
  // with the reveal, never before, and the recipient can always pause it.
  const music = useQuery({
    queryKey: ["ecard-music", slug],
    queryFn: async () =>
      (await getEcardMusic({ data: { slug } } as never)) as {
        music: {
          title: string;
          kind: string;
          url: string | null;
          words: string | null;
        } | null;
      },
  });
  const musicUrl = music.data?.music?.url ?? null;
  const musicKind = music.data?.music?.kind ?? null;
  // A song sits underneath the card and repeats. A letter or a poem is
  // listened to, so it plays through once and then stops.
  const musicLoops = musicKind === "song";
  const musicWords = music.data?.music?.words?.trim() || null;
  const [showWords, setShowWords] = useState(false);
  const heardRef = useRef(false);
  const markHeard = () => {
    if (heardRef.current) return;
    heardRef.current = true;
    void markEcardMusicHeard({ data: { slug } } as never).catch(() => {});
  };


  useEffect(() => {
    if (!started || mode !== "cards" || keepsake || items.length === 0) return;
    const t = setTimeout(() => {
      setIndex((i) => {
        if (i + 1 >= items.length) {
          setKeepsake(true);
          return i;
        }
        return i + 1;
      });
    }, 5200);
    return () => clearTimeout(t);
  }, [started, mode, index, keepsake, items.length]);

  const playMontage = async () => {
    setStarted(true);
    setMode("montage");
    if (curation || curating) return;
    setCurating(true);
    try {
      const res = await curate({ data: { slug } });
      setCuration(res.curation ?? null);
    } catch {
      setCuration(null);
    } finally {
      setCurating(false);
    }
  };

  if (!reveal) {
    return <SealedCard slug={slug} theme={theme} />;
  }


  const current = items[index];

  return (
    <div className="venture-ecards min-h-dvh px-4 py-10" style={{ background: theme.bg }}>
      {started && musicUrl ? (
        <div className="mx-auto mb-4 w-full max-w-md">
          <p className="mb-1 text-sm" style={{ color: theme.ink, opacity: 0.75 }}>
            {musicKind === "letter"
              ? "A letter for you, read aloud"
              : musicKind === "poem"
                ? "A poem for you, read aloud"
                : "A song for you"}
            {music.data?.music?.title ? `: ${music.data.music.title}` : ""}
          </p>
          <audio
            src={musicUrl}
            autoPlay
            controls
            loop={musicLoops}
            onPlay={markHeard}
            className="w-full"
            aria-label={`Music for this card: ${music.data?.music?.title ?? "attached piece"}`}
          />
          {musicWords ? (
            <>
              <button
                type="button"
                onClick={() => setShowWords((v) => !v)}
                className="mt-2 text-sm underline underline-offset-4"
                style={{ color: theme.ink, opacity: 0.75 }}
              >
                {showWords ? "Hide the words" : "Read the words instead"}
              </button>
              {showWords ? (
                <p
                  className="mt-2 whitespace-pre-line rounded-2xl p-4 text-base leading-relaxed"
                  style={{ background: theme.surface, color: theme.ink }}
                >
                  {musicWords}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      {started && <ConfettiBurst colors={[theme.accent, theme.ink, "#D4B483", "#6B4227"]} />}
      {!started ? (
        <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center text-center">
          <div
            className="w-full rounded-3xl p-8 shadow-sm ecard-unfold"
            style={{ background: theme.surface, color: theme.ink }}
          >
            <p className="text-5xl" aria-hidden>
              {theme.motif}
            </p>
            <h1 className="mt-4 font-display text-3xl" style={{ fontFamily: theme.display }}>
              {reveal.occasion}, {reveal.recipient_name}
            </h1>
            <p className="mt-3 text-sm" style={{ opacity: 0.75 }}>
              {items.length} {items.length === 1 ? "person" : "people"} left you a message.
            </p>
            <button
              type="button"
              onClick={playMontage}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full px-6 text-base font-semibold"
              style={{ background: theme.accent, color: theme.accentInk }}
            >
              Play the montage
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("cards");
                setStarted(true);
              }}
              className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border px-6 text-base font-medium"
              style={{ borderColor: `${theme.ink}33` }}
            >
              Read them one by one
            </button>
          </div>
        </div>
      ) : mode === "montage" ? (
        <div className="mx-auto max-w-2xl">
          {curating ? (
            <p className="py-16 text-center text-base" style={{ color: theme.ink, opacity: 0.75 }}>
              Setting the scene...
            </p>
          ) : (
            <EcardMontage
              reveal={reveal}
              curation={curation}
              onExit={() => {
                setMode("cards");
                setIndex(0);
                setKeepsake(false);
              }}
            />
          )}
        </div>
      ) : keepsake ? (
        <div className="mx-auto max-w-2xl">
          <header className="text-center" style={{ color: theme.ink }}>
            <p className="text-4xl" aria-hidden>
              {theme.motif}
            </p>
            <h1 className="mt-2 font-display text-3xl" style={{ fontFamily: theme.display }}>
              {reveal.occasion}, {reveal.recipient_name}
            </h1>
            <p className="mt-2 text-sm" style={{ opacity: 0.7 }}>
              Your keepsake. This page stays here for you.
            </p>
            <button
              type="button"
              onClick={playMontage}
              className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-semibold"
              style={{ background: theme.accent, color: theme.accentInk }}
            >
              Play the montage
            </button>
          </header>

          <ul className="mt-8 space-y-4">
            {items.map((c) => (
              <li
                key={c.id}
                className="rounded-3xl p-6 shadow-sm ecard-fade"
                style={{ background: theme.surface, color: theme.ink }}
              >
                <p
                  className="text-xs font-medium uppercase tracking-wider"
                  style={{ opacity: 0.55 }}
                >
                  {c.contributor_name}
                </p>
                {c.message && (
                  <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">{c.message}</p>
                )}
                <ContributionMedia
                  item={c}
                  name={c.contributor_name}
                  className="mt-4 space-y-4"
                  mediaClassName="max-h-72 w-full rounded-2xl object-contain"
                />

              </li>
            ))}
          </ul>
          <p className="mt-8 text-center text-xs" style={{ color: theme.ink, opacity: 0.55 }}>
            Group eCards by The Kenroe Collective
          </p>
        </div>
      ) : (
        <div className="mx-auto grid min-h-[75vh] max-w-lg place-items-center">
          <div className="w-full">
            <div
              key={current?.id}
              className="rounded-3xl p-7 shadow-sm ecard-slide sm:p-9"
              style={{ background: theme.surface, color: theme.ink }}
            >
              <p className="text-xs font-medium uppercase tracking-wider" style={{ opacity: 0.55 }}>
                {current?.contributor_name}
              </p>
              {current?.message && (
                <p
                  className="mt-3 whitespace-pre-wrap text-lg leading-relaxed"
                  style={{ fontFamily: theme.display }}
                >
                  {current.message}
                </p>
              )}
              {current && (
                <ContributionMedia
                  item={current}
                  name={current.contributor_name}
                  className="mt-4 space-y-4"
                  mediaClassName="max-h-72 w-full rounded-2xl object-contain"
                />
              )}

            </div>
            <div className="mt-5 flex items-center justify-between" style={{ color: theme.ink }}>
              <span className="text-xs" style={{ opacity: 0.6 }}>
                {index + 1} of {items.length}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="rounded-full border px-4 py-1.5 text-xs font-medium disabled:opacity-40"
                  style={{ borderColor: `${theme.ink}33` }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() =>
                    index + 1 >= items.length ? setKeepsake(true) : setIndex((i) => i + 1)
                  }
                  className="rounded-full px-4 py-1.5 text-xs font-medium"
                  style={{ background: theme.accent, color: theme.accentInk }}
                >
                  {index + 1 >= items.length ? "See them all" : "Next"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SealedCard({
  slug,
  theme,
}: {
  slug: string;
  theme: ReturnType<typeof getEcardTheme>;
}) {
  const lookup = useServerFn(getPublicEcard);
  const { data } = useQuery({
    queryKey: ["ecard", "sealed", slug],
    queryFn: () => lookup({ data: { slug } }),
  });
  const card = data?.card ?? null;
  const countdown = useRevealCountdown(card?.reveal_date);
  const unlockLocal = useLocalDateTime(card?.reveal_date);


  return (
    <div
      className="grid min-h-screen place-items-center px-4 text-center"
      style={{ background: theme.bg }}
    >
      <div
        className="max-w-sm rounded-3xl p-8 shadow-sm"
        style={{ background: theme.surface, color: theme.ink }}
      >
        <p className="text-5xl" aria-hidden>
          🎁
        </p>
        <h1 className="mt-4 font-display text-2xl" style={{ fontFamily: theme.display }}>
          Still sealed
        </h1>
        {card && countdown && !countdown.done ? (
          <>
            <p className="mt-4 text-lg font-medium" aria-live="polite">
              Your card unlocks in {formatCountdown(countdown)}
            </p>
            <p className="mt-2 text-sm" style={{ opacity: 0.75 }}>
              Unlocks {unlockLocal}, shown in your own time zone. The messages stay hidden until
              then.

            </p>
            <div className="mt-5">
              <AddRevealToCalendarButton
                cardId={slug}
                occasion={card.occasion}
                recipientName={card.recipient_name}
                revealDate={card.reveal_date}
                cardHref={`/r/${slug}`}
                label="Add reveal to calendar"
              />
            </div>
          </>
        ) : (

          <p className="mt-3 text-sm" style={{ opacity: 0.75 }}>
            There is something waiting here, but it will not open until the reveal moment. Come back
            then.
          </p>
        )}
      </div>
    </div>
  );
}
