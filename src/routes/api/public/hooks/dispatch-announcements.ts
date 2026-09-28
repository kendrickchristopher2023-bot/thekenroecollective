import { createFileRoute } from "@tanstack/react-router";

// Flips any scheduled announcement whose scheduled_for has arrived to "sent"
// and fans out email deliveries for event-scoped ones (channel: email).
// Called by pg_cron once a minute. Safe to call at any time.
export const Route = createFileRoute("/api/public/hooks/dispatch-announcements")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { verifyCronSecret } = await import("@/lib/cron-auth.server");
        if (!(await verifyCronSecret(request))) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        const { createClient } = await import("@supabase/supabase-js");
        const sb = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        );
        const nowIso = new Date().toISOString();

        // First flip due-scheduled → sent and capture their metadata.
        const { data: flipped, error } = await sb
          .from("announcements")
          .update({ status: "sent", sent_at: nowIso })
          .eq("status", "scheduled")
          .lte("scheduled_for", nowIso)
          .select("id, audience, event_id, title, body, type, link_url, link_label, channels, email_subject, email_body, sms_text");

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }

        let emailsQueued = 0;
        let emailsFailed = 0;
        let smsQueued = 0;

        if (flipped && flipped.length > 0) {
          // Lazy-import server-only helper (never at module scope of a route file).
          const { enqueueTransactionalEmailServer } = await import(
            "@/lib/email/server-enqueue.server"
          );

          const OPT_OUT_DISCLOSURE =
            " Reply STOP to opt out. Msg & data rates may apply. The Kenroe Collective.";
          const { getEffectiveSmsCap, isUnlimited } = await import("@/lib/tier-limits");
          const { resolveUserTier } = await import("@/lib/tier-guards.server");

          for (const a of flipped as Array<{
            id: string;
            audience: string;
            event_id: string | null;
            title: string;
            body: string;
            type: string;
            link_url: string | null;
            link_label: string | null;
            channels: string[] | null;
            email_subject: string | null;
            email_body: string | null;
            sms_text: string | null;
          }>) {
            const channels = a.channels ?? [];
            if (a.audience !== "event" || !a.event_id) continue;

            const { data: eventRow } = await sb
              .from("events")
              .select("data, user_id, is_demo")
              .eq("id", a.event_id)
              .maybeSingle();
            if ((eventRow as { is_demo?: boolean } | null)?.is_demo) continue;
            const guests: Array<{ id?: string; name?: string; email?: string | null; phone?: string | null }> =
              (eventRow?.data as any)?.guests ?? [];

            if (channels.includes("email")) {
              const emails = Array.from(
                new Set(
                  guests
                    .map((g) => (g.email ?? "").trim().toLowerCase())
                    .filter((e) => e.includes("@")),
                ),
              );
              for (const addr of emails) {
                const res = await enqueueTransactionalEmailServer({
                  templateName: "event-announcement",
                  recipientEmail: addr,
                  idempotencyKey: `announce-${a.id}-${addr}`,
                  templateData: {
                    title: a.email_subject || a.title,
                    body: a.email_body || a.body,
                    type_label: a.type,
                    event_title: (eventRow?.data as any)?.title ?? null,
                    coverImage: (eventRow?.data as any)?.image ?? "",
                    link_url: a.link_url,
                    link_label: a.link_label,
                  },
                });
                if (res.ok) emailsQueued++;
                else emailsFailed++;
              }
            }

            // SMS leg — previously only fired from the "publish now" button in
            // the UI, never from this cron dispatcher, so a scheduled
            // announcement with channels ["email","sms"] silently dropped the
            // SMS half while the UI still showed it as "sent."
            if (channels.includes("sms") && eventRow?.user_id) {
              const phones = guests
                .map((g) => ({ raw: (g.phone ?? "").trim(), guestId: g.id ?? null, guestName: g.name ?? null }))
                .filter((g) => /\+?\d[\d\-()]{5,}/.test(g.raw));
              if (phones.length) {
                const norm = (p: string) => p.replace(/\D/g, "");
                const normPhones = Array.from(new Set(phones.map((p) => norm(p.raw))));
                const { data: existing } = await sb
                  .from("sms_consent_log")
                  .select("phone_number, opted_out")
                  .in("phone_number", normPhones);
                const optedOut = new Set(
                  (existing ?? []).filter((r: any) => r.opted_out).map((r: any) => r.phone_number as string),
                );
                const everSeen = new Set((existing ?? []).map((r: any) => r.phone_number as string));

                let cap = Infinity;
                try {
                  const resolved = await resolveUserTier(sb, eventRow.user_id);
                  const { data: hostProfile } = await sb
                    .from("profiles")
                    .select("sms_pack_enabled")
                    .eq("id", eventRow.user_id)
                    .maybeSingle();
                  const smsPackPaid =
                    resolved.isOwner ||
                    resolved.isAdmin ||
                    !!(hostProfile as { sms_pack_enabled?: boolean } | null)?.sms_pack_enabled;
                  const tierCap = getEffectiveSmsCap(resolved.tier, smsPackPaid);
                  if (!isUnlimited(tierCap)) {
                    const { count: alreadySent } = await sb
                      .from("sms_outbox")
                      .select("id", { count: "exact", head: true })
                      .eq("event_id", a.event_id)
                      .neq("status", "failed");
                    cap = Math.max(0, tierCap - (alreadySent ?? 0));
                  }
                } catch (err) {
                  console.warn("dispatch-announcements SMS tier check failed", err);
                }

                const smsBody = (a.sms_text || a.body).slice(0, 480);
                const rows: any[] = [];
                const newConsent: Array<{ phone_number: string }> = [];
                for (const p of phones) {
                  const n = norm(p.raw);
                  if (optedOut.has(n)) continue;
                  if (rows.length >= cap) break;
                  const isFirstEver = !everSeen.has(n);
                  if (isFirstEver) { newConsent.push({ phone_number: n }); everSeen.add(n); }
                  rows.push({
                    event_id: a.event_id,
                    user_id: eventRow.user_id,
                    to_phone: p.raw,
                    guest_id: p.guestId,
                    guest_name: p.guestName,
                    body: isFirstEver ? `${smsBody}${OPT_OUT_DISCLOSURE}` : smsBody,
                    status: "pending",
                    provider: "twilio",
                  });
                }
                if (newConsent.length) {
                  await sb.from("sms_consent_log").upsert(newConsent, { onConflict: "phone_number", ignoreDuplicates: true });
                }
                if (rows.length) {
                  const { error: smsErr, count } = await sb.from("sms_outbox").insert(rows, { count: "exact" });
                  if (!smsErr) smsQueued += count ?? rows.length;
                  else console.error("dispatch-announcements SMS insert failed", smsErr);
                }
              }
            }

            // Fire-and-forget: stamp material use on any pass attached to this event.
            try {
              await sb.rpc("mark_pass_material_use_by_event", {
                _event_id: a.event_id,
                _reason: "announcement_sent",
              } as never);
            } catch (err) {
              console.warn("dispatch-announcements mark_pass_material_use_by_event failed", err);
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            dispatched: flipped?.length ?? 0,
            emailsQueued,
            emailsFailed,
            smsQueued,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
