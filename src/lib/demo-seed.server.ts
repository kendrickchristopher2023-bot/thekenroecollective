/**
 * Demo environment seeding + nightly reset.
 *
 * Everything here operates ONLY on the shared demo host account
 * (DEMO_ACCOUNT_EMAIL). It never touches any other user's rows. The nightly
 * reset deletes that account's events and demo vendors, then re-inserts a
 * fresh set of fake data so Christopher can freely trash the demo.
 *
 * Server-only: uses the service-role client.
 */
import { DEMO_ACCOUNT_EMAIL } from "@/lib/demo-mode";

/**
 * Curated demo events that the nightly reset must leave alone.
 *
 * These are hand-built showcase events (the 210 guest reunion is the one behind
 * the printed card campaign). They are demo-flagged, so they stay out of every
 * report, but they are not part of the generated seed set: wiping them nightly
 * would delete work that cannot be regenerated. They are skipped on both the
 * delete and the insert, so their rows are never touched.
 */
// Never deleted and never re-seeded by the nightly reset. The showcase is the
// public sample the business card points at, so a reset must not blank it or
// create a second copy of it.
const SNAPSHOT_EVENT_IDS = ["demo-reunion-200", "demo-evt-supper"] as const;
const SNAPSHOT_EVENT_TITLES: Record<(typeof SNAPSHOT_EVENT_IDS)[number], string> = {
  "demo-reunion-200": "The Kendrick Family Reunion",
  "demo-evt-supper": "Long Table Supper No. 6",
};
const PRESERVED_DEMO_EVENT_IDS = [...SNAPSHOT_EVENT_IDS, "showcase-wedding"] as const;

/** Slug prefix marking a vendor row as demo-owned and safe to delete on reset. */
const DEMO_VENDOR_SLUG_PREFIX = "demo-";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Find the demo auth user id, creating the account if it does not exist yet. */
export async function ensureDemoAccount(password: string): Promise<string | null> {
  const db = await admin();
  const existing = await findDemoUserId();
  if (existing) return existing;

  const { data, error } = await db.auth.admin.createUser({
    email: DEMO_ACCOUNT_EMAIL,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Demo Host", is_demo: true },
  });
  if (error || !data.user) return null;

  // Give the demo account the top tier so every feature is showcase-able.
  await db.from("profiles").update({ tier: "atelier" }).eq("id", data.user.id);
  return data.user.id;
}

export async function findDemoUserId(): Promise<string | null> {
  const db = await admin();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const match = data?.users?.find(
    (u) => (u.email ?? "").toLowerCase() === DEMO_ACCOUNT_EMAIL,
  );
  return match?.id ?? null;
}

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type DemoGuest = {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: "pending" | "yes" | "no" | "maybe" | "waitlisted";
  adults?: number;
  children?: number;
  dietary?: string;
};

function guests(seed: string, rows: Array<[string, string, DemoGuest["status"], number?]>): DemoGuest[] {
  return rows.map(([name, email, status, adults], i) => ({
    id: `${seed}-g${i + 1}`,
    name,
    email,
    phone: `(555) 555-01${String(i % 100).padStart(2, "0")}`,
    status,
    adults: adults ?? 1,
    children: 0,
    dietary: i % 4 === 0 ? "Vegetarian" : "",
  }));
}

function demoEvents(userId: string) {
  return [

    {
      id: "demo-evt-gala",
      user_id: userId,
      is_demo: true,
      share_token: "demo-share-gala",
      language: "en",
      data: {
        id: "demo-evt-gala",
        title: "The Harbourlight Autumn Gala",
        date: iso(34),
        venue: "The Harbourlight Room",
        address: "18 Marine Parade, Newport",
        description:
          "An evening of dinner, live strings and a silent auction benefiting the coastal arts fund.",
        message: "Black tie. Champagne at seven, dinner at eight.",
        dressCode: "Black tie",
        createdAt: new Date().toISOString(),
        capacity: 120,
        waitlistEnabled: true,
        autoPromote: true,
        plusOnesAllowed: 1,
        rsvpDeadline: iso(20),
        countdownEnabled: true,
        guests: guests("gala", [
          ["Marguerite Adler", "marguerite@example.com", "yes", 2],
          ["Theodore Vance", "theo@example.com", "yes"],
          ["Priya Raman", "priya@example.com", "maybe"],
          ["Callum Frost", "callum@example.com", "pending"],
          ["Ines Duarte", "ines@example.com", "no"],
          ["Noor Haddad", "noor@example.com", "yes", 2],
          ["Sebastian Cole", "seb@example.com", "waitlisted"],
        ]),
      },
    },
    {
      id: "demo-evt-wedding",
      user_id: userId,
      is_demo: true,
      share_token: "demo-share-wedding",
      language: "en",
      data: {
        id: "demo-evt-wedding",
        title: "Amara & Julien",
        date: iso(96),
        venue: "Villa Serrano",
        address: "Camino del Olivar 4, Ronda",
        description: "A three-day celebration in the hills above Ronda.",
        message: "We would be honoured to have you with us.",
        dressCode: "Garden formal",
        createdAt: new Date().toISOString(),
        capacity: 80,
        plusOnesAllowed: 1,
        rsvpDeadline: iso(60),
        countdownEnabled: true,
        guests: guests("wed", [
          ["Elena Marchetti", "elena@example.com", "yes", 2],
          ["Tobias Lund", "tobias@example.com", "yes"],
          ["Rosalind Okafor", "rosalind@example.com", "pending"],
          ["Hugo Bellamy", "hugo@example.com", "maybe"],
          ["Saoirse Kelly", "saoirse@example.com", "yes"],
        ]),
      },
    },
    {
      id: "demo-evt-supper",
      user_id: userId,
      is_demo: true,
      share_token: "demo-share-supper",
      language: "en",
      data: {
        id: "demo-evt-supper",
        title: "Long Table Supper No. 6",
        date: iso(12),
        venue: "The Glasshouse",
        address: "902 Fern Street, Portland",
        description: "Twenty seats, one table, six courses.",
        message: "Come hungry.",
        createdAt: new Date().toISOString(),
        capacity: 20,
        rsvpDeadline: iso(6),
        paymentEnabled: true,
        paymentAmount: 85,
        paymentCurrency: "usd",
        paymentPurpose: "Seat contribution",
        guests: guests("sup", [
          ["Nolan Avery", "wren@example.com", "yes"],
          ["Camille Brooks", "malik@example.com", "yes"],
          ["Sabrina Mercer", "delphine@example.com", "pending"],
          ["Elliot Vaughn", "arjun@example.com", "yes"],
        ]),
      },
    },
  ];
}

function demoVendors(userId: string) {
  const base = {
    owner_user_id: userId,
    is_demo: true,
    status: "verified",
    country: "US",
    gallery: [],
  };
  return [
    {
      ...base,
      name: "Sable & Fern Florals",
      slug: `${DEMO_VENDOR_SLUG_PREFIX}sable-fern-florals`,
      category: "Florist",
      city: "Portland",
      region: "OR",
      bio: "Seasonal, garden-style arrangements for intimate gatherings.",
      price_range: "$$",
    },
    {
      ...base,
      name: "Copperline Catering",
      slug: `${DEMO_VENDOR_SLUG_PREFIX}copperline-catering`,
      category: "Catering",
      city: "Newport",
      region: "RI",
      bio: "Coastal menus, plated or family style, for 20 to 300 guests.",
      price_range: "$$$",
    },
    {
      ...base,
      name: "Atlas String Quartet",
      slug: `${DEMO_VENDOR_SLUG_PREFIX}atlas-string-quartet`,
      category: "Music",
      city: "Boston",
      region: "MA",
      bio: "Ceremony and cocktail-hour strings, classical through contemporary.",
      price_range: "$$",
    },
  ];
}

/**
 * Delete every demo-owned row, then reinsert the fixed fake dataset.
 * Returns a summary for the cron response.
 */
export async function resetDemoData(): Promise<{
  ok: boolean;
  reason?: string;
  events?: number;
  vendors?: number;
  showcase?: import("@/lib/showcase-seed.server").EnsureShowcaseResult;
}> {
  const password = process.env["DEMO_ACCOUNT_PASSWORD"];
  if (!password) return { ok: false, reason: "DEMO_ACCOUNT_PASSWORD not set" };

  const userId = await ensureDemoAccount(password);
  if (!userId) return { ok: false, reason: "Demo account unavailable" };

  const db = await admin();

  // Curated demo events and all mutable child rows are restored transactionally
  // from their scrubbed snapshots, not merely preserved.
  const snapshotIds = [...SNAPSHOT_EVENT_IDS];
  const { data: snapshots, error: snapshotError } = await db
    .from("demo_event_snapshots")
    .select("event_id,row")
    .in("event_id", snapshotIds);
  if (snapshotError || (snapshots ?? []).length !== snapshotIds.length) {
    return { ok: false, reason: snapshotError?.message ?? "Demo event snapshots are incomplete" };
  }
  for (const snapshot of (snapshots ?? []) as { event_id: string; row: Record<string, unknown> }[]) {
    const expectedTitle = SNAPSHOT_EVENT_TITLES[snapshot.event_id as keyof typeof SNAPSHOT_EVENT_TITLES];
    const snapshotData = snapshot.row.data as Record<string, unknown> | undefined;
    if (!expectedTitle || snapshotData?.title !== expectedTitle) {
      return { ok: false, reason: `Demo snapshot title mismatch: ${snapshot.event_id}` };
    }
    const { error } = await (db as any).rpc("restore_demo_event_snapshot", { _event_id: snapshot.event_id });
    if (error) return { ok: false, reason: error.message };
  }

  // Wipe — scoped strictly to the demo account / demo-flagged rows.
  await db.from("sms_outbox").delete().eq("user_id", userId);
  await db
    .from("events")
    .delete()
    .eq("user_id", userId)
    .eq("is_demo", true)
    .not("id", "in", `(${PRESERVED_DEMO_EVENT_IDS.join(",")})`);
  await db
    .from("vendors")
    .delete()
    .eq("owner_user_id", userId)
    .eq("is_demo", true);
  await db.from("ai_packages").delete().eq("user_id", userId);
  await db.from("design_assets").delete().eq("user_id", userId);
  await db.from("contacts").delete().eq("owner_user_id", userId);

  // Demo checkouts are forced into Stripe's sandbox (the demo page promises
  // test-mode payments), so whatever a visitor "buys" during the day must be
  // gone by morning: sandbox subscriptions, passes, add-ons, entitlements,
  // sound purchases, carts and consent records. All scoped to the demo
  // account, and the demo's tier is restored right after (see below).
  await db.from("event_addons").delete().eq("user_id", userId);
  await db.from("one_time_passes").delete().eq("user_id", userId);
  await db.from("subscriptions").delete().eq("user_id", userId);
  await db.from("ai_package_entitlements").delete().eq("user_id", userId);
  await db.from("sound_piece_purchases").delete().eq("user_id", userId);
  await db.from("purchase_consent_log").delete().eq("user_id", userId);
  await db.from("carts").delete().eq("user_id", userId);
  await db.from("ecards").delete().eq("organizer_user_id", userId);

  // Anything an owner deliberately deleted is tombstoned and stays deleted.
  const { data: tombstones } = await db
    .from("demo_seed_tombstones")
    .select("kind,row_key");
  const buried = new Set(
    (tombstones ?? []).map((t: { kind: string; row_key: string }) => `${t.kind}:${t.row_key}`),
  );

  const preserved = new Set<string>(PRESERVED_DEMO_EVENT_IDS);
  const events = demoEvents(userId).filter(
    (e) => !buried.has(`event:${e.id}`) && !preserved.has(e.id),
  );
  const vendors = demoVendors(userId).filter((v) => !buried.has(`vendor:${v.slug}`));

  const { error: eventErr } = events.length
    ? await db.from("events").insert(events as never)
    : { error: null };
  const { error: vendorErr } = vendors.length
    ? await db.from("vendors").insert(vendors as never)
    : { error: null };

  if (eventErr || vendorErr) {
    return {
      ok: false,
      reason: eventErr?.message ?? vendorErr?.message,
    };
  }

  await db.from("profiles").update({ tier: "atelier" }).eq("id", userId);

  // The showcase is never part of the wipe (the database refuses to delete
  // it), but if it is ever missing, the nightly run is the first thing that
  // puts it back. Preserve this order: the wipe above must never see it as a
  // seed row, or a tombstone could keep it out.
  const { ensureShowcaseEvent } = await import("@/lib/showcase-seed.server");
  const showcase = await ensureShowcaseEvent({ force: true });

  return { ok: true, events: events.length, vendors: vendors.length, showcase };
}
