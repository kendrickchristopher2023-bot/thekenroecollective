import { createFileRoute, Link } from "@tanstack/react-router";
import { Music4 } from "lucide-react";
import { getThankYouCopy } from "@/lib/thankyou-print.functions";

type ThankYouCopy = {
  eventTitle: string;
  hostName: string | null;
  guestName: string;
  message: string;
  signOff: string | null;
  design: string;
  photo: string | null;
  gif: string | null;
  pieceUrl: string | null;
  pieceTitle: string | null;
  pieceKind: string | null;
};

export const Route = createFileRoute("/thanks/$token")({
  loader: async ({ params }) => {
    const result = (await getThankYouCopy({ data: { token: params.token } } as never)) as {
      copy: ThankYouCopy | null;
    };
    return result;
  },
  head: () => ({
    meta: [
      { title: "A private thank-you | The Kenroe Collective" },
      { name: "description", content: "A private thank-you card made for one guest." },
      { property: "og:title", content: "A private thank-you" },
      { property: "og:description", content: "A private thank-you card made for one guest." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ThankYouCopyPage,
  errorComponent: () => (
    <main className="min-h-screen bg-paper px-6 py-20 text-center text-ink">
      <h1 className="font-serif text-3xl">This card could not be opened</h1>
      <p className="mt-3 text-sm text-muted-foreground">Please try the link again in a moment.</p>
    </main>
  ),
  notFoundComponent: MissingCopy,
});

const THEMES: Record<string, string> = {
  ivory: "bg-paper text-ink",
  velvet: "bg-velvet text-paper",
  garden: "bg-sage/15 text-ink",
  midnight: "bg-ink text-paper",
  confetti: "bg-blossom/10 text-ink",
};

function MissingCopy() {
  return (
    <main className="min-h-screen bg-paper px-6 py-20 text-center text-ink">
      <h1 className="font-serif text-3xl">This private card is not available</h1>
      <p className="mt-3 text-sm text-muted-foreground">Ask the host for a fresh copy.</p>
    </main>
  );
}

function ThankYouCopyPage() {
  const { copy } = Route.useLoaderData();
  if (!copy) return <MissingCopy />;
  const theme = THEMES[copy.design] ?? THEMES.ivory;
  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:px-6 sm:py-16">
      <article className={`mx-auto max-w-2xl border border-border p-6 shadow-xl sm:p-10 ${theme}`}>
        <p className="text-xs font-medium uppercase tracking-widest opacity-65">A private thank-you for {copy.guestName}</p>
        <h1 className="mt-3 font-serif text-4xl">{copy.eventTitle}</h1>
        {copy.photo ? <img src={copy.photo} alt={`A memory from ${copy.eventTitle}`} className="mt-6 max-h-[28rem] w-full object-contain" /> : null}
        <p className="mt-7 whitespace-pre-wrap text-base leading-7">{copy.message}</p>
        {copy.signOff ? <p className="mt-6 font-serif text-2xl">{copy.signOff}</p> : null}
        {copy.gif ? <img src={copy.gif} alt="An animated part of this thank-you" className="mt-7 max-h-80 w-full object-contain" /> : null}
        {copy.pieceUrl ? (
          <section className="mt-8 border-t border-current/15 pt-6">
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest opacity-65">
              <Music4 className="h-4 w-4" aria-hidden /> {copy.pieceKind === "letter" ? "A letter for you" : copy.pieceKind === "poem" ? "A poem for you" : "A song for you"}
            </p>
            <h2 className="mt-2 font-serif text-2xl">{copy.pieceTitle ?? "Made for you"}</h2>
            <audio src={copy.pieceUrl} controls preload="metadata" className="mt-4 w-full" />
          </section>
        ) : null}
      </article>
      <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-muted-foreground">
        This link was made for you. <Link to="/gatherings" className="underline">The Kenroe Collective</Link>
      </p>
    </main>
  );
}