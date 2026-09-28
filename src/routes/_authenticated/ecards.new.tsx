import { toUserMessage } from "@/lib/user-error";
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { createEcard } from "@/lib/ecards.functions";
import { localTimeZone, revealInputToUtcIso } from "@/lib/ecards-reveal-time";
import { ECARD_OCCASIONS, ECARD_THEMES, groupedEcardThemes } from "@/lib/ecard-themes";
import { VentureBackLink } from "@/components/venture-back-link";

export const Route = createFileRoute("/_authenticated/ecards/new")({
  head: () => ({
    meta: [
      { title: "Create a group card — The Kenroe Collective" },
      {
        name: "description",
        content: "Pick an occasion, choose a design, set the reveal date, then share one link.",
      },
      { property: "og:title", content: "Create a group card" },
      {
        property: "og:description",
        content: "Pick an occasion, choose a design, set the reveal date, then share one link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewEcard,
});

function defaultRevealDate() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function NewEcard() {
  const create = useServerFn(createEcard);
  const navigate = useNavigate();
  const [occasion, setOccasion] = useState(ECARD_OCCASIONS[0]!);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [theme, setTheme] = useState(ECARD_THEMES[0]!.id);
  const [revealDate, setRevealDate] = useState(defaultRevealDate());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientName.trim()) {
      setErr("Who is the card for?");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const { card } = await create({
        data: {
          occasion,
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim() || null,
          theme,
          revealDate: revealInputToUtcIso(revealDate, localTimeZone()),
          timezone: localTimeZone(),
        },
      });
      await navigate({ to: "/ecards/$id", params: { id: card.id } });
    } catch (e2) {
      setErr(toUserMessage(e2, "We could not create the card. Please try again."));
      setSaving(false);
    }
  };

  return (
    <div className="venture-ecards mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <VentureBackLink to="/ecards" label="Back to Group eCards" />
      <h1 className="mt-6 font-display text-3xl text-ink">Create a group card</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink/70">
        Three quick details and you will have a link to share with everyone.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-7">
        <div>
          <label htmlFor="occasion" className="block text-sm font-medium text-ink">
            Occasion
          </label>
          <select
            id="occasion"
            value={occasion}
            onChange={(e) => setOccasion(e.target.value)}
            className="mt-2 w-full rounded-xl border border-ink/15 bg-paper px-4 py-3 text-base text-ink"
          >
            {ECARD_OCCASIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="recipient" className="block text-sm font-medium text-ink">
            Who is it for?
          </label>
          <input
            id="recipient"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="e.g. Priya"
            maxLength={120}
            className="mt-2 w-full rounded-xl border border-ink/15 bg-paper px-4 py-3 text-base text-ink"
          />
        </div>

        <div>
          <label htmlFor="recipientEmail" className="block text-sm font-medium text-ink">
            Their email address (optional for now)
          </label>
          <input
            id="recipientEmail"
            type="email"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="priya@example.com"
            maxLength={320}
            className="mt-2 w-full rounded-xl border border-ink/15 bg-paper px-4 py-3 text-base text-ink"
          />
          <p className="mt-1.5 text-xs text-ink/55">
            We email them the card on the reveal date. You can add this later.
          </p>
        </div>

        <div>
          <span className="block text-sm font-medium text-ink">Design</span>
          <p className="mt-1 text-xs text-ink/55">Scroll for more designs. Tap one to choose it.</p>
          <div className="mt-3 max-h-[26rem] space-y-5 overflow-y-auto pr-1">
            {groupedEcardThemes().map((g) => (
              <div key={g.group}>
                <p className="text-xs font-medium uppercase tracking-wider text-ink/55">
                  {g.group}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {g.themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={theme === t.id}
                      className={`overflow-hidden rounded-2xl border text-left transition ${
                        theme === t.id
                          ? "border-velvet ring-2 ring-velvet/30"
                          : "border-ink/10 hover:border-ink/25"
                      }`}
                    >
                      <span
                        className="flex h-20 items-center justify-center text-2xl"
                        style={{ background: t.bg }}
                        aria-hidden
                      >
                        {t.motif}
                      </span>
                      <span className="block px-3 py-2">
                        <span className="block text-xs font-medium text-ink">{t.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-ink/55">
                          {t.blurb}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="reveal" className="block text-sm font-medium text-ink">
            Reveal date and time
          </label>
          <input
            id="reveal"
            type="datetime-local"
            value={revealDate}
            onChange={(e) => setRevealDate(e.target.value)}
            className="mt-2 w-full rounded-xl border border-ink/15 bg-paper px-4 py-3 text-base text-ink"
          />
          <p className="mt-1.5 text-xs text-ink/55">
            Nobody sees the messages before this moment, not even the people adding them.
          </p>
        </div>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-velvet px-7 py-3 text-base font-medium text-paper transition hover:opacity-90 disabled:opacity-60 sm:w-auto"
          >
            {saving ? "Creating..." : "Create card and get the link"}
          </button>
          <VentureBackLink to="/ecards" label="Cancel and go back" className="justify-center" />
        </div>
      </form>
    </div>
  );
}
