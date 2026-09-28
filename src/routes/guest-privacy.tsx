import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import { SiteFooter, SiteNav } from "@/components/site-nav";
import { formatStampDate } from "@/lib/datetime";

interface RecordItem {
  eventId: string;
  eventTitle: string;
  guest: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    status?: string;
    invitedAt?: string;
    respondedAt?: string;
    adults?: number;
    children?: number;
    pets?: number;
    category?: string;
  };
}

type VerifyState =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "ok"; email: string; records: RecordItem[]; deletionRequested: boolean };

export const Route = createFileRoute("/guest-privacy")({
  validateSearch: (s: Record<string, unknown>): { token?: string } => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),

  head: () => ({
    meta: [
      { title: "Guest Privacy Request — The Kenroe Collective" },
      {
        name: "description",
        content:
          "Guests invited through The Kenroe Collective can view or request deletion of their personal information here.",
      },
      { property: "og:title", content: "Guest Privacy Request — The Kenroe Collective" },
      {
        property: "og:description",
        content: "View or request deletion of your guest information.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GuestPrivacyPage,
});

function GuestPrivacyPage() {
  const { token } = useSearch({ from: Route.id });
  if (token) return <TokenView token={token} />;
  return <EmailEntry />;
}

function EmailEntry() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submittedTo, setSubmittedTo] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(trimmed) || submitting) return;
    setSubmitting(true);
    setNotFound(false);
    try {
      const res = await fetch("/api/public/guest-privacy/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { status?: string };
      if (res.status === 429) {
        toast.error("Too many requests. Please try again later.");
      } else if (data.status === "not_found") {
        setNotFound(true);
      } else if (data.status === "sent") {
        setSubmittedTo(trimmed);
      } else {
        toast.error("Something went wrong. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
        Privacy
      </span>
      <h1 className="mt-3 font-serif text-4xl font-medium tracking-tight">
        Guest Privacy Request
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/70">
        If you were invited to an event through The Kenroe Collective, you
        can view or request deletion of your personal information here.
      </p>

      {submittedTo ? (
        <div className="mt-10 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <h2 className="font-serif text-lg font-medium text-ink">Check your inbox</h2>
          <p className="mt-2 text-sm text-ink/70">
            We sent a verification link to <span className="font-medium text-ink">{submittedTo}</span>.
            Click the link to continue. The link expires in 24 hours.
          </p>
        </div>
      ) : notFound ? (
        <div className="mt-10 rounded-2xl border border-ink/10 bg-white p-6 shadow-sm">
          <p className="text-sm text-ink/80">
            We did not find any records associated with this email address.
            If you believe this is an error, contact us at{" "}
            <a
              className="text-velvet underline underline-offset-4"
              href="mailto:support@thekenroecollective.com"
            >
              support@thekenroecollective.com
            </a>
            .
          </p>
          <button
            type="button"
            onClick={() => {
              setNotFound(false);
              setEmail("");
            }}
            className="mt-4 text-xs font-medium text-velvet underline underline-offset-4"
          >
            Try a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 space-y-3">
          <label htmlFor="gp-email" className="block text-xs font-medium uppercase tracking-wide text-ink/70">
            Email address
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="gp-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-velvet/30"
            />
            <button
              type="submit"
              disabled={submitting || !email.trim()}
              className="inline-flex items-center justify-center rounded-full bg-velvet px-6 py-3 text-sm font-medium text-white shadow-sm disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Submit"}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            We will send a verification link to this email address. We do not
            store your email if no matching records are found.
          </p>
        </form>
      )}
    </Shell>
  );
}

function TokenView({ token }: { token: string }) {
  const [state, setState] = useState<VerifyState>({ kind: "loading" });
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/public/guest-privacy/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          email?: string;
          records?: RecordItem[];
        };
        if (!alive) return;
        if (res.status === 410 && data.status === "expired") {
          setState({ kind: "expired" });
        } else if (res.status === 410 && data.status === "used") {
          setState({ kind: "used" });
        } else if (res.ok && (data.status === "ok" || data.status === "deletion_requested")) {
          setState({
            kind: "ok",
            email: data.email ?? "",
            records: data.records ?? [],
            deletionRequested: data.status === "deletion_requested",
          });
        } else {
          setState({ kind: "invalid" });
        }
      } catch {
        if (alive) setState({ kind: "invalid" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const download = () => {
    if (state.kind !== "ok") return;
    const payload = {
      email: state.email,
      exportedAt: new Date().toISOString(),
      records: state.records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kenroe-guest-data-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const requestDeletion = async () => {
    if (state.kind !== "ok" || deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/public/guest-privacy/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) {
        setState({ ...state, deletionRequested: true });
        setConfirming(false);
      } else {
        toast.error("Could not submit deletion request. Please try again.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <Shell>
        <p className="mt-20 text-center text-sm text-muted-foreground">
          Verifying your request…
        </p>
      </Shell>
    );
  }

  if (state.kind === "invalid" || state.kind === "used") {
    return (
      <Shell>
        <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
          Link no longer valid
        </h1>
        <p className="mt-3 text-sm text-ink/70">
          This verification link is invalid or has already been used.{" "}
          <a href="/guest-privacy" className="text-velvet underline underline-offset-4">
            Start a new request
          </a>
          .
        </p>
      </Shell>
    );
  }

  if (state.kind === "expired") {
    return (
      <Shell>
        <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
          Link expired
        </h1>
        <p className="mt-3 text-sm text-ink/70">
          Verification links expire after 24 hours.{" "}
          <a href="/guest-privacy" className="text-velvet underline underline-offset-4">
            Request a new link
          </a>
          .
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-velvet">
        Verified
      </span>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight">
        Your guest information
      </h1>
      <p className="mt-3 text-sm text-ink/70">
        Below is every event record associated with{" "}
        <span className="font-medium text-ink">{state.email}</span>.
      </p>

      {state.deletionRequested ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A deletion request has already been submitted for this email.
          Your data will be removed within 30 days. You will receive a
          confirmation email when deletion is complete.
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        {state.records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No records associated with this email.
          </p>
        ) : (
          state.records.map((r, i) => <RecordCard key={`${r.eventId}-${i}`} record={r} />)
        )}
      </div>

      {state.records.length > 0 && !state.deletionRequested ? (
        <div className="mt-10 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={download}
            className="inline-flex items-center justify-center rounded-full border border-ink/20 bg-white px-5 py-2.5 text-sm font-medium text-ink shadow-sm hover:bg-ink/5"
          >
            Download My Data
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700"
          >
            Request Deletion
          </button>
        </div>
      ) : null}

      {confirming ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-5">
          <h3 className="font-serif text-base font-medium text-red-900">
            Are you sure?
          </h3>
          <p className="mt-2 text-sm text-red-900/80">
            This will remove your name, email, phone, and other personal
            information from all events. This cannot be undone. The event
            host will be notified.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={requestDeletion}
              disabled={deleting}
              className="inline-flex items-center justify-center rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60"
            >
              {deleting ? "Submitting…" : "Yes, request deletion"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center justify-center rounded-full border border-ink/15 bg-white px-5 py-2 text-sm text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state.deletionRequested ? (
        <p className="mt-6 text-xs text-muted-foreground">
          Need help? Contact{" "}
          <a
            href="mailto:support@thekenroecollective.com"
            className="text-velvet underline underline-offset-4"
          >
            support@thekenroecollective.com
          </a>
          .
        </p>
      ) : null}
    </Shell>
  );
}

function RecordCard({ record }: { record: RecordItem }) {
  const g = record.guest;
  const rows = useMemo(() => {
    const items: Array<[string, string]> = [];
    if (g.name) items.push(["Name", g.name]);
    if (g.email) items.push(["Email", g.email]);
    if (g.phone) items.push(["Phone", g.phone]);
    if (g.address) items.push(["Address", g.address]);
    if (g.status) items.push(["RSVP status", g.status]);
    if (g.invitedAt) items.push(["Date added", formatStampDate((g.invitedAt))]);
    if (g.respondedAt) items.push(["Responded", formatStampDate((g.respondedAt))]);
    return items;
  }, [g]);

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
      <h3 className="font-serif text-lg font-medium text-ink">{record.eventTitle}</h3>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteNav />
      <section className="mx-auto max-w-3xl px-6 py-20">{children}</section>
      <SiteFooter />
    </div>
  );
}
