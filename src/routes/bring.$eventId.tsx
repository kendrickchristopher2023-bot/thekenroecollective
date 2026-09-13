import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { BringSheetGuest } from "@/components/bring-sheet-guest";
import { fetchPublicEvent } from "@/lib/events-store";

export const Route = createFileRoute("/bring/$eventId")({
  head: () => ({
    meta: [
      { title: "What to bring — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Sign up to bring a dish, dessert, drinks or supplies. Claim what's still needed, or offer your own, no account required.",
      },
      { property: "og:title", content: "What to bring — sign-up sheet" },
      {
        property: "og:description",
        content: "See what's still needed for this gathering and sign up to bring it.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BringPage,
});

function BringPage() {
  const { eventId } = Route.useParams();
  const [title, setTitle] = useState("");

  useEffect(() => {
    fetchPublicEvent(eventId)
      .then((ev) => ev && setTitle(ev.title ?? ""))
      .catch(() => {});
  }, [eventId]);

  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-6">
          <h1 className="font-serif text-4xl font-medium">
            {title ? `What to bring for ${title}` : "What to bring"}
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Pick anything that suits you. Your host sees your name and note, and nothing else.
          </p>
          <div className="mt-8">
            <BringSheetGuest eventId={eventId} compact />
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
