/**
 * The host's own hearing test.
 *
 * Christopher caught "six oh oh pee em" himself, by accident, after guests
 * could already hear it. So the exact spoken script is shown here, word for
 * word, before anyone else hears it, and anything the voice still gets wrong
 * (a venue, a family name) can be corrected with a phonetic spelling.
 *
 * The words shown are produced by the same function that feeds the speech
 * request, so this cannot drift out of step with what guests hear.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { KEvent } from "@/lib/events-store";
import { updateEvent } from "@/lib/events-store";
import { narrationParagraphs } from "@/lib/invite-narration";

export function InvitationReadingPreview({ event, eventId }: { event: KEvent; eventId: string }) {
  const [term, setTerm] = useState("");
  const [sayAs, setSayAs] = useState("");

  const list = event.pronunciations ?? [];

  const paragraphs = useMemo(
    () =>
      narrationParagraphs({
        title: event.title,
        date: event.date,
        timezone: event.timezone,
        venue: event.venue,
        address: event.address,
        message: event.message,
        welcomeQuote: event.welcomeQuote,
        hostName: event.hosts?.[0]?.name ?? null,
        hosts: event.hosts ?? null,
        dressCode: event.dressCode,
        bringNote: event.bringSheetEnabled
          ? "There's a sign-up sheet on this page for what to bring, if you'd like to add something."
          : null,
        pronunciations: list,
      }),
    [event, list],
  );

  function addPronunciation() {
    const t = term.trim();
    const a = sayAs.trim();
    if (!t || !a) return;
    const next = [...list.filter((p) => p.term.toLowerCase() !== t.toLowerCase()), { term: t, sayAs: a }].slice(0, 24);
    updateEvent(eventId, { pronunciations: next });
    setTerm("");
    setSayAs("");
    toast.success("Saved. Rebuild the reading to hear it.");
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-medium">What guests will hear</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Read this through before you share the invitation. Times, dates and street names are said
          in words, so nothing comes out as "six oh oh".
        </p>
        <div className="mt-2 space-y-2 rounded-lg bg-secondary/60 p-3 text-sm leading-relaxed">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium">Fix a pronunciation</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          A name or venue said wrong? Type it as written, then spell it the way it sounds.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Written, e.g. Kenroe"
            aria-label="Word as written"
            className="min-w-[9rem] flex-1 rounded-lg border border-ink/10 px-3 py-2 text-sm"
          />
          <input
            value={sayAs}
            onChange={(e) => setSayAs(e.target.value)}
            placeholder="Say it as, e.g. Ken-roe"
            aria-label="How to say it"
            className="min-w-[9rem] flex-1 rounded-lg border border-ink/10 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={addPronunciation}
            className="rounded-full bg-velvet px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            disabled={!term.trim() || !sayAs.trim()}
          >
            Save
          </button>
        </div>
        {list.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-2">
            {list.map((p) => (
              <li
                key={p.term}
                className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-[11px]"
              >
                <span>
                  {p.term} → {p.sayAs}
                </span>
                <button
                  type="button"
                  aria-label={`Remove pronunciation for ${p.term}`}
                  onClick={() =>
                    updateEvent(eventId, {
                      pronunciations: list.filter((x) => x.term !== p.term),
                    })
                  }
                  className="text-muted-foreground hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
