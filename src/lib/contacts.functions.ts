import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertNotDemo } from "@/lib/demo-mode.server";
import { isShowcaseEvent } from "@/lib/showcase";

// ---- Atelier gate ----
async function assertAtelier(context: { supabase: any; userId: string }) {
  const { supabase, userId } = context;
  const { data: isOwner } = await supabase.rpc("has_role", { _user_id: userId, _role: "owner" });
  if (isOwner) return;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (isAdmin) return;
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("price_id,status,current_period_end")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"]);
  const now = Date.now();
  const ok = (subs || []).some((s: any) => {
    const priceOk = /^atelier/i.test(s.price_id || "") || /^studio_collective/i.test(s.price_id || "");
    if (!priceOk) return false;
    if (!s.current_period_end) return true;
    return new Date(s.current_period_end).getTime() > now;
  });
  if (!ok) throw new Error("Atelier subscription required");
}

type ContactInput = {
  id?: string;
  display_name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  source?: string;
  first_seen_event_id?: string | null;
};

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { search?: string; tag?: string; groupId?: string; limit?: number } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    let q = context.supabase
      .from("contacts")
      .select("id, display_name, email, phone, tags, source, first_seen_event_id, email_opt_out, created_at, updated_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(Math.min(data.limit ?? 500, 1000));

    if (data.search) {
      const s = data.search.trim();
      if (s) q = q.or(`display_name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`);
    }
    if (data.tag) q = q.contains("tags", [data.tag]);

    if (data.groupId) {
      const { data: members } = await context.supabase
        .from("contact_group_members")
        .select("contact_id")
        .eq("group_id", data.groupId);
      const ids = (members || []).map((m: any) => m.contact_id);
      if (ids.length === 0) return { contacts: [] };
      q = q.in("id", ids);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { contacts: rows ?? [] };
  });

export const getContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const { data: contact, error } = await context.supabase
      .from("contacts").select("*").eq("id", data.id).eq("owner_user_id", context.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!contact) throw new Error("Not found");
    const { data: links } = await context.supabase
      .from("contact_event_links").select("*").eq("contact_id", data.id);
    const { data: groupRows } = await context.supabase
      .from("contact_group_members").select("group_id, contact_groups(id, name, color)").eq("contact_id", data.id);
    return { contact, links: links ?? [], groups: (groupRows ?? []).map((g: any) => g.contact_groups).filter(Boolean) };
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ContactInput) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const name = (data.display_name || "").trim();
    if (!name) throw new Error("Name is required");
    const payload = {
      owner_user_id: context.userId,
      display_name: name,
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      notes: data.notes ?? null,
      tags: Array.isArray(data.tags) ? data.tags.slice(0, 40).map((t) => String(t).trim()).filter(Boolean) : [],
      source: data.source || "manual",
      first_seen_event_id: data.first_seen_event_id ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("contacts").update(payload).eq("id", data.id).eq("owner_user_id", context.userId)
        .select().maybeSingle();
      if (error) throw new Error(error.message);
      return { contact: row };
    }
    const { data: row, error } = await context.supabase
      .from("contacts").insert(payload).select().maybeSingle();
    if (error) {
      if (/duplicate|unique/i.test(error.message)) throw new Error("A contact with this email or phone already exists");
      throw new Error(error.message);
    }
    return { contact: row };
  });

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const { error } = await context.supabase
      .from("contacts").delete().eq("id", data.id).eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkTagContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[]; addTags?: string[]; removeTags?: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const ids = (data.ids || []).filter(Boolean);
    if (ids.length === 0) return { ok: true };
    const add = data.addTags || [];
    const remove = data.removeTags || [];
    const { data: rows } = await context.supabase
      .from("contacts").select("id, tags").in("id", ids).eq("owner_user_id", context.userId);
    for (const r of rows || []) {
      const set = new Set<string>(r.tags || []);
      for (const t of add) set.add(t);
      for (const t of remove) set.delete(t);
      await context.supabase.from("contacts").update({ tags: Array.from(set) })
        .eq("id", r.id).eq("owner_user_id", context.userId);
    }
    return { ok: true };
  });

// ---- Merge / dedupe ----
type DupeGroup = {
  key: string;
  kind: "name" | "email" | "phone";
  contacts: Array<{
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    tags: string[];
    source: string;
    created_at: string;
  }>;
};

export const findContactDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAtelier(context);
    const { data: rows } = await context.supabase
      .from("contacts")
      .select("id, display_name, email, phone, email_norm, phone_norm, tags, source, created_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: true });

    const byName = new Map<string, any[]>();
    const byEmail = new Map<string, any[]>();
    const byPhone = new Map<string, any[]>();
    for (const r of rows || []) {
      const nk = (r.display_name || "").trim().toLowerCase();
      if (nk) {
        const arr = byName.get(nk) || [];
        arr.push(r); byName.set(nk, arr);
      }
      if (r.email_norm) {
        const arr = byEmail.get(r.email_norm) || [];
        arr.push(r); byEmail.set(r.email_norm, arr);
      }
      if (r.phone_norm) {
        const arr = byPhone.get(r.phone_norm) || [];
        arr.push(r); byPhone.set(r.phone_norm, arr);
      }
    }

    const groups: DupeGroup[] = [];
    const seen = new Set<string>();
    const pushGroup = (kind: DupeGroup["kind"], key: string, arr: any[]) => {
      if (arr.length < 2) return;
      const gkey = kind + ":" + key + ":" + arr.map((r) => r.id).sort().join(",");
      if (seen.has(gkey)) return;
      seen.add(gkey);
      groups.push({ key, kind, contacts: arr });
    };
    for (const [k, arr] of byEmail) pushGroup("email", k, arr);
    for (const [k, arr] of byPhone) pushGroup("phone", k, arr);
    for (const [k, arr] of byName) pushGroup("name", k, arr);
    return { groups };
  });

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { primaryId: string; mergeIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const primaryId = data.primaryId;
    const mergeIds = (data.mergeIds || []).filter((id) => id && id !== primaryId);
    if (!primaryId || mergeIds.length === 0) return { ok: true, merged: 0 };

    // Load all involved (ownership-scoped)
    const ids = [primaryId, ...mergeIds];
    const { data: rows, error } = await context.supabase
      .from("contacts")
      .select("id, display_name, email, phone, notes, tags, source, first_seen_event_id")
      .in("id", ids)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    const primary = (rows || []).find((r: any) => r.id === primaryId);
    if (!primary) throw new Error("Primary contact not found");
    const others = (rows || []).filter((r: any) => r.id !== primaryId);
    if (others.length === 0) return { ok: true, merged: 0 };

    // Merge fields
    const tagSet = new Set<string>(primary.tags || []);
    let email = primary.email;
    let phone = primary.phone;
    let notes = primary.notes;
    let firstSeen = primary.first_seen_event_id;
    for (const o of others) {
      (o.tags || []).forEach((t: string) => tagSet.add(t));
      if (!email && o.email) email = o.email;
      if (!phone && o.phone) phone = o.phone;
      if (!notes && o.notes) notes = o.notes;
      if (!firstSeen && o.first_seen_event_id) firstSeen = o.first_seen_event_id;
    }

    // Reassign event links (upsert to avoid unique conflicts, then delete stragglers)
    const { data: links } = await context.supabase
      .from("contact_event_links")
      .select("id, contact_id, event_id, rsvp_status, gift_amount_cents, thankyou_sent_at")
      .in("contact_id", mergeIds);
    for (const l of links || []) {
      await context.supabase
        .from("contact_event_links")
        .upsert(
          {
            contact_id: primaryId,
            event_id: l.event_id,
            rsvp_status: l.rsvp_status,
            gift_amount_cents: l.gift_amount_cents,
            thankyou_sent_at: l.thankyou_sent_at,
          },
          { onConflict: "contact_id,event_id" },
        );
    }

    // Reassign group memberships
    const { data: gm } = await context.supabase
      .from("contact_group_members")
      .select("group_id, contact_id")
      .in("contact_id", mergeIds);
    for (const m of gm || []) {
      await context.supabase
        .from("contact_group_members")
        .upsert({ group_id: m.group_id, contact_id: primaryId }, { onConflict: "group_id,contact_id" });
    }

    // Update primary
    await context.supabase
      .from("contacts")
      .update({
        email,
        phone,
        notes,
        tags: Array.from(tagSet),
        first_seen_event_id: firstSeen,
      })
      .eq("id", primaryId)
      .eq("owner_user_id", context.userId);

    // Delete merged (cascades links/members)
    await context.supabase
      .from("contacts")
      .delete()
      .in("id", mergeIds)
      .eq("owner_user_id", context.userId);

    return { ok: true, merged: mergeIds.length };
  });

// ---- CSV import/export ----
function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const parseRow = (line: string) => {
    const out: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const header = parseRow(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = parseRow(l);
    const rec: Record<string, string> = {};
    header.forEach((h, i) => { rec[h] = (cells[i] ?? "").trim(); });
    return rec;
  });
}

export const importContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { csv: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    // Rate-limit: 10k contacts per user per day (rolling 24h)
    const DAILY_CAP = 10000;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recent } = await context.supabase
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_id", context.userId)
      .eq("source", "csv")
      .gte("created_at", since);
    const remaining = Math.max(0, DAILY_CAP - (recent || 0));
    if (remaining <= 0) {
      throw new Error(`Daily CSV import limit reached (${DAILY_CAP}/day). Try again in 24 hours.`);
    }
    const rows = parseCsv(data.csv).slice(0, remaining);
    let inserted = 0, skipped = 0;
    for (const r of rows) {
      const name = (r.name || r.display_name || "").trim();
      if (!name) { skipped++; continue; }
      const tags = (r.tags || "").split(/[,|;]/).map((t) => t.trim()).filter(Boolean);
      const { error } = await context.supabase.from("contacts").insert({
        owner_user_id: context.userId,
        display_name: name,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        notes: r.notes || null,
        tags,
        source: "csv",
      });
      if (error) skipped++;
      else inserted++;
    }
    const capped = parseCsv(data.csv).length > remaining;
    return { inserted, skipped, capped, remaining: remaining - inserted };
  });

export const exportContactsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertNotDemo("export");
    await assertAtelier(context);
    const { data: rows } = await context.supabase
      .from("contacts")
      .select("display_name, email, phone, tags, notes, source, created_at")
      .eq("owner_user_id", context.userId)
      .order("created_at", { ascending: false });
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "name,email,phone,tags,notes,source,created_at";
    const body = (rows || []).map((r: any) => [
      esc(r.display_name), esc(r.email), esc(r.phone),
      esc((r.tags || []).join("|")), esc(r.notes), esc(r.source), esc(r.created_at),
    ].join(",")).join("\n");
    return { csv: header + "\n" + body };
  });

// ---- Groups ----
export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAtelier(context);
    const { data } = await context.supabase
      .from("contact_groups").select("id, name, color, created_at")
      .eq("owner_user_id", context.userId).order("name");
    return { groups: data ?? [] };
  });

export const createGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string; color?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const name = data.name.trim();
    if (!name) throw new Error("Name required");
    const { data: row, error } = await context.supabase
      .from("contact_groups").insert({ owner_user_id: context.userId, name, color: data.color ?? null })
      .select().maybeSingle();
    if (error) throw new Error(error.message);
    return { group: row };
  });

export const deleteGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const { error } = await context.supabase
      .from("contact_groups").delete().eq("id", data.id).eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addToGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string; contactIds: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const rows = data.contactIds.map((cid) => ({ group_id: data.groupId, contact_id: cid }));
    if (rows.length === 0) return { ok: true };
    await context.supabase.from("contact_group_members").upsert(rows, { onConflict: "group_id,contact_id" });
    return { ok: true };
  });

export const removeFromGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { groupId: string; contactId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    await context.supabase.from("contact_group_members").delete()
      .eq("group_id", data.groupId).eq("contact_id", data.contactId);
    return { ok: true };
  });

// ---- Check whether user has access (for UI gate) ----
export const hasContactsAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      await assertAtelier(context);
      return { allowed: true };
    } catch {
      return { allowed: false };
    }
  });

// ---- Auto-capture: upsert contacts from event guests ----
type GuestInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  rsvpStatus?: string | null;
};

export const upsertContactsFromGuests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { eventId: string; guests: GuestInput[] }) => input)
  .handler(async ({ data, context }) => {
    // Silent no-op for non-Atelier so callers stay simple.
    try {
      await assertAtelier(context);
    } catch {
      return { ok: true, captured: 0, skipped: 0, note: "not_atelier" };
    }

    let captured = 0;
    let skipped = 0;
    const eventId = String(data.eventId || "").slice(0, 200);
    if (!eventId) return { ok: false, captured: 0, skipped: 0 };

    for (const g of data.guests || []) {
      const name = (g.name || "").trim();
      if (!name) { skipped++; continue; }
      const email = (g.email || "").trim().toLowerCase() || null;
      const phone = (g.phone || "").trim() || null;
      const phoneDigits = phone ? phone.replace(/[^0-9+]/g, "") : null;

      // Find existing contact by email, then phone, then name.
      let existing: any = null;
      if (email) {
        const { data: r } = await context.supabase
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", context.userId)
          .eq("email_norm", email)
          .maybeSingle();
        existing = r;
      }
      if (!existing && phoneDigits) {
        const { data: r } = await context.supabase
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", context.userId)
          .eq("phone_norm", phoneDigits)
          .maybeSingle();
        existing = r;
      }
      if (!existing) {
        // Escape ilike wildcards so a guest name containing "%" or "_"
        // can't wildcard-match an unrelated same-owner contact.
        const escapedName = name.replace(/[%_]/g, (c) => `\\${c}`);
        const { data: r } = await context.supabase
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", context.userId)
          .ilike("display_name", escapedName)
          .is("email_norm", null)
          .is("phone_norm", null)
          .maybeSingle();
        existing = r;
      }

      let contactId: string | null = existing?.id ?? null;
      if (!contactId) {
        const { data: inserted, error } = await context.supabase
          .from("contacts")
          .insert({
            owner_user_id: context.userId,
            display_name: name,
            email,
            phone,
            source: "event",
            first_seen_event_id: eventId,
            tags: ["guest"],
          })
          .select("id")
          .maybeSingle();
        if (error || !inserted) { skipped++; continue; }
        contactId = (inserted as any).id;
        captured++;
      } else if (existing) {
        // Matched an existing contact — previously only the event link was
        // written, so a re-import/re-RSVP with newly-added contact info
        // (e.g. the guest supplies an email this time) never reached the CRM
        // record, leaving it permanently stale. Fill missing fields only;
        // never overwrite a value the contact already has.
        const fill: { email?: string; phone?: string } = {};
        if (email && !(existing as any).email) fill.email = email;
        if (phone && !(existing as any).phone) fill.phone = phone;
        if (Object.keys(fill).length) {
          await context.supabase.from("contacts").update(fill as never).eq("id", contactId);
        }
      }

      if (contactId) {
        await context.supabase
          .from("contact_event_links")
          .upsert(
            {
              contact_id: contactId,
              event_id: eventId,
              rsvp_status: g.rsvpStatus ?? null,
            },
            { onConflict: "contact_id,event_id" },
          );
      }
    }

    return { ok: true, captured, skipped };
  });

// ---- Email opt-out toggle (per contact) ----
export const setContactEmailPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; emailOptOut: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const { error } = await context.supabase
      .from("contacts")
      .update({ email_opt_out: !!data.emailOptOut })
      .eq("id", data.id)
      .eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Public RSVP → capture into event owner's contacts (Atelier-only) ----
// No auth middleware: called from the public invite page. All privileged
// writes go through supabaseAdmin after we verify the event owner has
// Atelier access. Silent no-op for non-Atelier owners so the RSVP flow
// stays unblocked.
export const capturePublicRsvpContact = createServerFn({ method: "POST" })
  .inputValidator((input: {
    eventId: string;
    guest: { name: string; email?: string | null; phone?: string | null; rsvpStatus?: string | null };
  }) => input)
  .handler(async ({ data }) => {
    // Showcase: never harvest a viewer of the sample into anyone's contacts.
    if (isShowcaseEvent(data.eventId)) return { ok: false, reason: "showcase" };
    try {
      // Rate limit: 10 RSVP contact captures per IP per minute.
      const { getRequest } = await import("@tanstack/react-start/server");
      const { enforceIpRateLimit } = await import("@/lib/rate-limit.server");
      try {
        const req = getRequest();
        const limited = enforceIpRateLimit(req, {
          scope: "rsvp-capture",
          max: 10,
          windowMs: 60 * 1000,
        });
        if (limited) throw limited;
      } catch (e) {
        if (e instanceof Response) throw e;
        // getRequest() outside a request context — proceed without limiting.
      }

      const eventId = String(data.eventId || "").slice(0, 200);
      const name = (data.guest?.name || "").trim();
      if (!eventId || !name) return { ok: false, reason: "invalid" };

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Event owner
      const { data: ev } = await supabaseAdmin
        .from("events").select("user_id").eq("id", eventId).maybeSingle();
      const ownerUserId = (ev as any)?.user_id as string | undefined;
      if (!ownerUserId) return { ok: false, reason: "no_owner" };

      // Atelier gate on owner
      const { data: isOwnerRole } = await supabaseAdmin.rpc("has_role", { _user_id: ownerUserId, _role: "owner" as any });
      const { data: isAdminRole } = await supabaseAdmin.rpc("has_role", { _user_id: ownerUserId, _role: "admin" as any });
      let allowed = !!isOwnerRole || !!isAdminRole;
      if (!allowed) {
        const { data: subs } = await supabaseAdmin
          .from("subscriptions").select("price_id,status,current_period_end")
          .eq("user_id", ownerUserId).in("status", ["active", "trialing", "past_due"]);
        const now = Date.now();
        allowed = (subs || []).some((s: any) => {
          const priceOk = /^atelier/i.test(s.price_id || "") || /^studio_collective/i.test(s.price_id || "");
          if (!priceOk) return false;
          return !s.current_period_end || new Date(s.current_period_end).getTime() > now;
        });
      }
      if (!allowed) return { ok: true, captured: 0, reason: "owner_not_atelier" };

      const email = (data.guest.email || "").trim().toLowerCase() || null;
      const phone = (data.guest.phone || "").trim() || null;
      const phoneDigits = phone ? phone.replace(/[^0-9+]/g, "") : null;

      // Dedup: email → phone → name (scoped to owner)
      let existingId: string | null = null;
      let existingContact: { email: string | null; phone: string | null } | null = null;
      if (email) {
        const { data: r } = await supabaseAdmin
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", ownerUserId).eq("email_norm", email).maybeSingle();
        if (r) { existingId = (r as any).id; existingContact = r as any; }
      }
      if (!existingId && phoneDigits) {
        const { data: r } = await supabaseAdmin
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", ownerUserId).eq("phone_norm", phoneDigits).maybeSingle();
        if (r) { existingId = (r as any).id; existingContact = r as any; }
      }
      if (!existingId) {
        // Escape ilike wildcards so a guest name containing "%" or "_"
        // can't wildcard-match an unrelated same-owner contact.
        const escapedName = name.replace(/[%_]/g, (c) => `\\${c}`);
        const { data: r } = await supabaseAdmin
          .from("contacts").select("id, tags, email, phone")
          .eq("owner_user_id", ownerUserId).ilike("display_name", escapedName)
          .is("email_norm", null).is("phone_norm", null).maybeSingle();
        if (r) { existingId = (r as any).id; existingContact = r as any; }
      }

      const rsvpTag = data.guest.rsvpStatus === "yes" ? "rsvp-yes"
        : data.guest.rsvpStatus === "no" ? "rsvp-no"
        : data.guest.rsvpStatus === "maybe" ? "rsvp-maybe"
        : "rsvp";

      if (!existingId) {
        const { data: inserted } = await supabaseAdmin
          .from("contacts").insert({
            owner_user_id: ownerUserId,
            display_name: name,
            email,
            phone,
            source: "rsvp",
            first_seen_event_id: eventId,
            tags: ["guest", rsvpTag],
          }).select("id").maybeSingle();
        if (!inserted) return { ok: false, reason: "insert_failed" };
        existingId = (inserted as any).id;
      } else {
        // Merge tag onto existing, and fill in any contact info this RSVP
        // supplied that the record didn't already have (previously left
        // permanently stale after the first capture).
        const { data: existing } = await supabaseAdmin
          .from("contacts").select("tags").eq("id", existingId).maybeSingle();
        const tags = new Set<string>(((existing as any)?.tags as string[]) || []);
        tags.add(rsvpTag);
        const update: { tags: string[]; email?: string; phone?: string } = { tags: Array.from(tags) };
        if (email && !existingContact?.email) update.email = email;
        if (phone && !existingContact?.phone) update.phone = phone;
        await supabaseAdmin.from("contacts").update(update as never).eq("id", existingId);
      }

      await supabaseAdmin.from("contact_event_links").upsert(
        { contact_id: existingId as string, event_id: eventId, rsvp_status: data.guest.rsvpStatus ?? null },
        { onConflict: "contact_id,event_id" },
      );

      return { ok: true, captured: 1 };
    } catch (e) {
      console.error("capturePublicRsvpContact failed:", e);
      return { ok: false, reason: "error" };
    }
  });


// ---- Contact activity: linked events with basic data ----
export const getContactActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    // Ownership check
    const { data: contact } = await context.supabase
      .from("contacts").select("id").eq("id", data.id).eq("owner_user_id", context.userId).maybeSingle();
    if (!contact) throw new Error("Not found");

    const { data: links } = await context.supabase
      .from("contact_event_links")
      .select("event_id, rsvp_status, gift_amount_cents, thankyou_sent_at, created_at")
      .eq("contact_id", data.id)
      .order("created_at", { ascending: false });

    const eventIds = (links || []).map((l: any) => l.event_id);
    let eventsById: Record<string, any> = {};
    if (eventIds.length) {
      const { data: evs } = await context.supabase
        .from("events").select("id, data, created_at").in("id", eventIds);
      for (const e of evs || []) {
        const d = (e as any).data || {};
        eventsById[(e as any).id] = {
          id: (e as any).id,
          title: d.title || d.eventTitle || "Untitled event",
          date: d.date || d.eventDate || null,
        };
      }
    }
    return {
      links: (links || []).map((l: any) => ({ ...l, event: eventsById[l.event_id] || null })),
    };
  });

// ---- Bulk delete ----
export const bulkDeleteContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const ids = (data.ids || []).filter(Boolean).slice(0, 1000);
    if (ids.length === 0) return { ok: true, deleted: 0 };
    const { error } = await context.supabase
      .from("contacts").delete().in("id", ids).eq("owner_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: ids.length };
  });

// ---- Broadcast history ----
export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAtelier(context);
    const { data: rows } = await context.supabase
      .from("contact_broadcasts")
      .select("id, subject, body_preview, recipient_count, queued_count, skipped_count, filter_tag, sent_at")
      .eq("owner_user_id", context.userId)
      .order("sent_at", { ascending: false })
      .limit(100);
    return { broadcasts: rows ?? [] };
  });

// ---- Broadcast to contacts (Atelier-only) ----
function spamScore(subject: string, body: string): { ok: boolean; reason?: string } {
  const combined = `${subject} ${body}`;
  const letters = combined.replace(/[^A-Za-z]/g, "");
  if (letters.length > 40) {
    const upper = (letters.match(/[A-Z]/g) || []).length;
    if (upper / letters.length > 0.6) return { ok: false, reason: "Too many capital letters — please use normal case." };
  }
  const bangs = (combined.match(/!/g) || []).length;
  if (bangs > 8) return { ok: false, reason: "Too many exclamation marks." };
  const spamPhrases = /\b(viagra|casino|free money|click here now|100% free|winner!|earn \$|make \$\d+|forex|crypto giveaway)\b/i;
  if (spamPhrases.test(combined)) return { ok: false, reason: "Message contains phrases commonly flagged as spam." };
  return { ok: true };
}

export const sendContactBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    subject: string;
    body: string;
    tag?: string | null;
    groupId?: string | null;
    ctaUrl?: string | null;
    ctaLabel?: string | null;
    dryRun?: boolean;
    ids?: string[] | null;
  }) => input)
  .handler(async ({ data, context }) => {
    await assertAtelier(context);
    const subject = (data.subject || "").trim().slice(0, 200);
    const body = (data.body || "").trim().slice(0, 8000);
    if (!subject || !body) throw new Error("Subject and body are required");

    if (!data.dryRun) {
      const score = spamScore(subject, body);
      if (!score.ok) throw new Error(score.reason || "Message rejected");
    }

    // Daily rate-limit: 500 recipients / user / day
    const DAILY_CAP = 500;
    const HOURLY_CAP = 200;
    if (!data.dryRun) {
      const { data: dailyOk } = await context.supabase.rpc("check_auth_rate_limit", {
        _key: `contact_broadcast_day:${context.userId}`,
        _max: DAILY_CAP,
        _window_minutes: 1440,
      });
      if (dailyOk === false) throw new Error("Daily broadcast limit reached (500/day). Try again tomorrow.");
      const { data: hourlyOk } = await context.supabase.rpc("check_auth_rate_limit", {
        _key: `contact_broadcast_hr:${context.userId}`,
        _max: HOURLY_CAP,
        _window_minutes: 60,
      });
      if (hourlyOk === false) throw new Error("Hourly broadcast limit reached (200/hour). Try again shortly.");
    }

    // Fetch recipients
    let q = context.supabase
      .from("contacts")
      .select("id, display_name, email, email_opt_out, tags")
      .eq("owner_user_id", context.userId)
      .eq("email_opt_out", false)
      .not("email", "is", null);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (Array.isArray(data.ids) && data.ids.length > 0) q = q.in("id", data.ids.slice(0, 500));

    if (data.groupId) {
      const { data: members } = await context.supabase
        .from("contact_group_members").select("contact_id").eq("group_id", data.groupId);
      const ids = (members || []).map((m: any) => m.contact_id);
      if (ids.length === 0) return { queued: 0, skipped: 0, recipients: 0 };
      q = q.in("id", ids);
    }

    const { data: rows } = await q;
    const recipients = (rows || []).filter((r: any) => r.email && r.email.includes("@"));
    if (data.dryRun) return { queued: 0, skipped: 0, recipients: recipients.length };

    // Sender display name
    const { data: prof } = await context.supabase
      .from("profiles").select("display_name").eq("id", context.userId).maybeSingle();
    const senderName = (prof as any)?.display_name || "The Kenroe Collective";

    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    let queued = 0, skipped = 0;
    const stamp = Date.now();

    // Log broadcast row
    const { data: bcast } = await context.supabase
      .from("contact_broadcasts")
      .insert({
        owner_user_id: context.userId,
        subject,
        body_preview: body.slice(0, 500),
        recipient_count: recipients.length,
        filter_tag: data.tag || null,
        filter_group_id: data.groupId || null,
        cta_url: data.ctaUrl || null,
      })
      .select("id")
      .maybeSingle();
    const broadcastId = (bcast as any)?.id as string | undefined;

    const recipientRows: any[] = [];
    for (const r of recipients) {
      const res = await enqueueTransactionalEmailServer({
        templateName: "contact-broadcast",
        recipientEmail: r.email!,
        idempotencyKey: `broadcast:${context.userId}:${stamp}:${r.id}`,
        label: "contact-broadcast",
        templateData: {
          subject,
          body,
          senderName,
          ctaUrl: data.ctaUrl || null,
          ctaLabel: data.ctaLabel || null,
        },
      });
      if (res.ok) queued++;
      else skipped++;
      if (broadcastId) {
        recipientRows.push({
          broadcast_id: broadcastId,
          contact_id: r.id,
          email: r.email,
          status: res.ok ? "queued" : "skipped",
          error: res.ok ? null : (res.reason || null),
        });
      }
    }
    if (broadcastId) {
      if (recipientRows.length > 0) {
        await context.supabase.from("contact_broadcast_recipients").insert(recipientRows);
      }
      await context.supabase.from("contact_broadcasts").update({
        queued_count: queued, skipped_count: skipped,
      }).eq("id", broadcastId);
    }
    return { queued, skipped, recipients: recipients.length };
  });

