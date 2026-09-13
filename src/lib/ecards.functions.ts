// Group eCards (Venture 02) — server functions.
// Thin wrapper module: imports, types, and exported server-function
// declarations only. Runtime helpers live in ecards.server.ts / ecards.schemas.ts.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ecardPublicClient, makeEcardSlug } from "@/lib/ecards.server";
import { revealInputToUtcIso } from "@/lib/ecards-reveal-time";
import { ecardMediaPathFromUrl, type EcardMediaSlot } from "@/lib/ecard-media-slots";
import {
  ContributionActionInput,
  CreateEcardInput,
  DraftMessageInput,
  EcardCheckoutInput,
  EcardConfirmInput,
  EditContributionAsOrganizerInput,
  EditTokenInput,
  OrganizerContributionInput,
  RemoveContributionMediaInput,
  RemoveMediaByTokenInput,
  ReorderInput,
  SlugInput,
  SubmitContributionInput,
  UpdateByTokenInput,
  UpdateEcardInput,
  type ContributionRow,
  type EcardRow,
  type MyContribution,
  type PublicEcard,
  type RevealPayload,
} from "@/lib/ecards.schemas";
import type { MontageCuration } from "@/lib/ecards-montage.server";
import { parseInput } from "@/lib/user-error";
import { nullSafe } from "@/lib/zod-nullsafe";

export const listMyEcards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ cards: EcardRow[]; counts: Record<string, number> }> => {
    const { data, error } = await context.supabase
      .from("ecards")
      .select("*")
      .eq("organizer_user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const cards = (data ?? []) as EcardRow[];
    const counts: Record<string, number> = {};
    // Per-card exact counts. A single .in() list read can be silently capped by
    // PostgREST row limits, which made real cards look empty, so count per card
    // and surface any error instead of falling back to zero.
    await Promise.all(
      cards.map(async (c) => {
        const { count, error: countError } = await context.supabase
          .from("ecard_contributions")
          .select("id", { count: "exact", head: true })
          .eq("ecard_id", c.id);
        if (countError) throw new Error(countError.message);
        counts[c.id] = count ?? 0;
      }),
    );
    return { cards, counts };
  });

export const createEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(CreateEcardInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ card: EcardRow }> => {
    const { data: row, error } = await context.supabase
      .from("ecards")
      .insert({
        organizer_user_id: context.userId,
        occasion: data.occasion,
        recipient_name: data.recipientName,
        recipient_email: data.recipientEmail?.trim() || null,
        theme: data.theme,
        reveal_date: revealInputToUtcIso(data.revealDate, data.timezone),
        organizer_timezone: data.timezone ?? null,
        status: "collecting",
        public_slug: makeEcardSlug(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { card: row as EcardRow };
  });

export const getMyEcard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ card: EcardRow | null; contributions: ContributionRow[] }> => {
      const { data: card } = await context.supabase
        .from("ecards")
        .select("*")
        .eq("id", data.id)
        .maybeSingle();
      if (!card) return { card: null, contributions: [] };
      const { data: rows } = await context.supabase
        .from("ecard_contributions")
        .select("*")
        .eq("ecard_id", data.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      return { card: card as EcardRow, contributions: (rows ?? []) as ContributionRow[] };
    },
  );

/**
 * Backfill the organizer's time zone on a card that does not have one yet.
 * Used so reminder emails can be held to the organizer's daytime hours. It only
 * ever writes organizer_timezone, only when that column is still null, and only
 * on a card the signed-in organizer owns. Nothing else on the row is touched.
 */
export const setEcardOrganizerTimezone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; timezone: string }) => ({
    id: String(d.id),
    timezone: String(d.timezone).slice(0, 64),
  }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    if (!data.timezone.trim()) return { ok: false };
    const { error } = await context.supabase
      .from("ecards")
      .update({ organizer_timezone: data.timezone.trim() })
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .is("organizer_timezone", null);
    return { ok: !error };
  });


export const updateEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(UpdateEcardInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ card: EcardRow }> => {
    const patch: {
      occasion?: string;
      recipient_name?: string;
      recipient_email?: string | null;
      theme?: string;
      reveal_date?: string;
      status?: string;
    } = {};
    if (data.occasion !== undefined) patch.occasion = data.occasion;
    if (data.recipientName !== undefined) patch.recipient_name = data.recipientName;
    if (data.recipientEmail !== undefined) {
      patch.recipient_email = data.recipientEmail ? data.recipientEmail.trim() : null;
    }
    if (data.theme !== undefined) patch.theme = data.theme;
    if (data.revealDate !== undefined) {
      patch.reveal_date = revealInputToUtcIso(data.revealDate, data.timezone);
    }
    if (data.status !== undefined) patch.status = data.status;
    const { data: row, error } = await context.supabase
      .from("ecards")
      .update(patch)
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { card: row as EcardRow };
  });

/**
 * Duplicate a card the signed-in organizer owns. Additive only: it reads the
 * source row and INSERTs a fresh card with a new unguessable slug, unpaid and
 * undelivered, with no messages copied. The source card is never modified.
 */
export const duplicateEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ card: EcardRow }> => {
    const { data: source, error: readError } = await context.supabase
      .from("ecards")
      .select("*")
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!source) throw new Error("Card not found");
    const src = source as EcardRow;
    const { data: row, error } = await context.supabase
      .from("ecards")
      .insert({
        organizer_user_id: context.userId,
        occasion: src.occasion,
        recipient_name: src.recipient_name,
        recipient_email: src.recipient_email,
        theme: src.theme,
        reveal_date: src.reveal_date,
        status: "collecting",
        public_slug: makeEcardSlug(),
        is_paid: false,
        paid_at: null,
        delivered_at: null,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { card: row as EcardRow };
  });

export const deleteEcard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("ecards")
      .delete()
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setContributionHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(ContributionActionInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("ecard_contributions")
      .update({ is_hidden: data.hidden === true })
      .eq("id", data.contributionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(ContributionActionInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("ecard_contributions")
      .delete()
      .eq("id", data.contributionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Organizer editing a message on a card they own. RLS scopes every read and
 * write to the signed-in user, and we refuse once the card is revealed so a
 * sent keepsake can never change under the recipient.
 */
export const updateContributionAsOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(EditContributionAsOrganizerInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: existing } = await context.supabase
      .from("ecard_contributions")
      .select("id, ecard_id")
      .eq("id", data.contributionId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "That message could not be found." };
    const { data: card } = await context.supabase
      .from("ecards")
      .select("id, status, reveal_date, delivered_at")
      .eq("id", (existing as { ecard_id: string }).ecard_id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { ok: false, error: "That message could not be found." };
    const row = card as { status: string; reveal_date: string; delivered_at: string | null };
    const locked =
      row.status === "revealed" ||
      Boolean(row.delivered_at) ||
      new Date(row.reveal_date).getTime() <= Date.now();
    if (locked) return { ok: false, error: "This card has already been sent, so messages are locked." };
    const { error } = await context.supabase
      .from("ecard_contributions")
      .update({
        contributor_name: data.contributorName,
        message: data.message ?? "",
        media_type: data.mediaType,
        media_url: data.audioUrl ?? data.videoUrl ?? data.imageUrl ?? data.mediaUrl ?? null,
        gif_url: data.gifUrl ?? null,
        image_url: data.imageUrl ?? null,
        video_url: data.videoUrl ?? null,
        audio_url: data.audioUrl ?? null,
      })
      .eq("id", data.contributionId);
    if (error) return { ok: false, error: "We could not save that change. Please try again." };
    return { ok: true };
  });

/**
 * Remove exactly one attachment from a message on a card the organizer owns.
 * Only that slot's column is cleared, so the message text and the other
 * attachments are untouched, and the uploaded file behind it is deleted from
 * storage so nothing is left orphaned. GIFs are external links, so there is
 * only a reference to clear.
 */
export const removeContributionMediaAsOrganizer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(RemoveContributionMediaInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: existing } = await context.supabase
      .from("ecard_contributions")
      .select("id, ecard_id, message, gif_url, image_url, video_url, audio_url")
      .eq("id", data.contributionId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "That message could not be found." };
    const row = existing as {
      ecard_id: string;
      message: string | null;
      gif_url: string | null;
      image_url: string | null;
      video_url: string | null;
      audio_url: string | null;
    };
    const { data: card } = await context.supabase
      .from("ecards")
      .select("id, status, reveal_date, delivered_at")
      .eq("id", row.ecard_id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { ok: false, error: "That message could not be found." };
    const c = card as { status: string; reveal_date: string; delivered_at: string | null };
    const locked =
      c.status === "revealed" ||
      Boolean(c.delivered_at) ||
      new Date(c.reveal_date).getTime() <= Date.now();
    if (locked) {
      return { ok: false, error: "This card has already been sent, so messages are locked." };
    }

    const slot: EcardMediaSlot = data.slot;
    const next: Record<EcardMediaSlot, string | null> = {
      gif: row.gif_url,
      image: row.image_url,
      video: row.video_url,
      audio: row.audio_url,
    };
    const removedUrl = next[slot];
    if (!removedUrl) return { ok: true };
    next[slot] = null;
    if (!String(row.message ?? "").trim() && !next.gif && !next.image && !next.video && !next.audio) {
      return {
        ok: false,
        error: "This message would be empty. Add some words first, or delete the whole message.",
      };
    }
    const mediaType = next.gif
      ? "gif"
      : next.audio
        ? "audio"
        : next.video
          ? "video"
          : next.image
            ? "image"
            : "none";
    const { error } = await context.supabase
      .from("ecard_contributions")
      .update({
        media_type: mediaType,
        media_url: next.audio ?? next.video ?? next.image ?? null,
        gif_url: next.gif,
        image_url: next.image,
        video_url: next.video,
        audio_url: next.audio,
      })
      .eq("id", data.contributionId);
    if (error) return { ok: false, error: "We could not remove that attachment. Please try again." };

    const path = ecardMediaPathFromUrl(removedUrl);
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("ecard-media").remove([path]);
    }
    return { ok: true };
  });



export const reorderContributions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(ReorderInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    for (let i = 0; i < data.orderedIds.length; i += 1) {
      const { error } = await context.supabase
        .from("ecard_contributions")
        .update({ position: i })
        .eq("id", data.orderedIds[i]!)
        .eq("ecard_id", data.ecardId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------- Public (no login) ----------

export const getPublicEcard = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(SlugInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ card: PublicEcard | null }> => {
    const sb = ecardPublicClient();
    const { data: row } = await sb.rpc("get_ecard_by_slug", { _slug: data.slug });
    return { card: (row as PublicEcard | null) ?? null };
  });

export const submitContribution = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(SubmitContributionInput), d, "input"),
  )
  .handler(
    async ({
      data,
    }): Promise<{ ok: boolean; error?: string; recipientName?: string; editToken?: string }> => {
      const sb = ecardPublicClient();
      const { data: res, error } = await sb.rpc("add_ecard_contribution", {
        _slug: data.slug,
        _contributor_name: data.contributorName,
        _message: data.message ?? "",
        _media_type: data.mediaType,
        _media_url: data.mediaUrl ?? undefined,
        _gif_url: data.gifUrl ?? undefined,
        _image_url: data.imageUrl ?? undefined,
        _video_url: data.videoUrl ?? undefined,
        _audio_url: data.audioUrl ?? undefined,
      });
      if (error) return { ok: false, error: "We could not save your message. Please try again." };
      const out = res as {
        ok: boolean;
        error?: string;
        recipient_name?: string;
        edit_token?: string;
      };
      return out.ok
        ? { ok: true, recipientName: out.recipient_name, editToken: out.edit_token }
        : { ok: false, error: out.error ?? "We could not save your message." };
    },
  );

export const getEcardReveal = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(SlugInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ reveal: RevealPayload | null }> => {
    const sb = ecardPublicClient();
    const { data: row } = await sb.rpc("get_ecard_reveal", { _slug: data.slug });
    return { reveal: (row as RevealPayload | null) ?? null };
  });

export const draftEcardMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(DraftMessageInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ message: string } | { error: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return { error: "Message help is not available right now." };
    const sb = ecardPublicClient();
    const { data: cardRow } = await sb.rpc("get_ecard_by_slug", { _slug: data.slug });
    const card = cardRow as { occasion?: string; recipient_name?: string } | null;
    if (!card) return { error: "This card is not available." };

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const { generateText } = await import("ai");
    try {
      const gateway = createLovableAiGatewayProvider(key);
      const { text } = await generateText({
        model: gateway("google/gemini-3.6-flash"),
        system:
          "You write short, warm, sincere group greeting card messages in British English. " +
          "Two to four sentences, no more than 60 words. Never use em dashes. Do not use headings, " +
          "quotes, or markdown. Do not sign off with a name.",
        prompt:
          `Occasion: ${card.occasion ?? "celebration"}\n` +
          `Recipient: ${card.recipient_name ?? "them"}\n` +
          `From: ${data.contributorName || "a friend"}\n` +
          `Notes from the writer: ${data.hint || "keep it warm and personal"}\n\n` +
          "Write the message.",
      });
      const message = text.trim().replace(/—/g, ",").slice(0, 900);
      if (!message) return { error: "We could not draft a message. Please try again." };
      return { message };
    } catch {
      return { error: "We could not draft a message. Please try again." };
    }
  });

// ---------- Organizer: own message, preview, delivery, payment ----------

export const addOrganizerContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(OrganizerContributionInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: card } = await context.supabase
      .from("ecards")
      .select("id, organizer_user_id")
      .eq("id", data.ecardId)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) throw new Error("Card not found");
    const { data: last } = await context.supabase
      .from("ecard_contributions")
      .select("position")
      .eq("ecard_id", data.ecardId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = ((last as { position?: number } | null)?.position ?? -1) + 1;
    const { error } = await context.supabase.from("ecard_contributions").insert({
      ecard_id: data.ecardId,
      contributor_name: data.contributorName,
      message: data.message ?? "",
      media_type: data.mediaType,
      media_url: data.audioUrl ?? data.videoUrl ?? data.imageUrl ?? data.mediaUrl ?? null,
      gif_url: data.gifUrl ?? null,
      image_url: data.imageUrl ?? null,
      video_url: data.videoUrl ?? null,
      audio_url: data.audioUrl ?? null,
      position: nextPosition,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewEcardReveal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ reveal: RevealPayload | null }> => {
    const { data: card } = await context.supabase
      .from("ecards")
      .select("*")
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { reveal: null };
    const row = card as EcardRow;
    const { data: rows } = await context.supabase
      .from("ecard_contributions")
      .select("id, contributor_name, message, media_type, media_url, gif_url, image_url, video_url, audio_url")
      .eq("ecard_id", data.id)
      .eq("is_hidden", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    return {
      reveal: {
        occasion: row.occasion,
        recipient_name: row.recipient_name,
        theme: row.theme,
        reveal_date: row.reveal_date,
        revealed: true,
        contributions: (rows ?? []) as RevealPayload["contributions"],
      },
    };
  });

export const createEcardCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(EcardCheckoutInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    const { data: card } = await context.supabase
      .from("ecards")
      .select("id, is_paid, recipient_name, music_piece_id")
      .eq("id", data.ecardId)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { error: "Card not found." };
    if ((card as { is_paid?: boolean }).is_paid) return { error: "This card is already paid for." };

    const { resolveDemoSafeStripeEnv } = await import("@/lib/demo-mode.server");
    const {
      createStripeClient,
      getStripeErrorMessage,
      createCheckoutSessionWithTax,
      resolveOrCreateCustomer,
    } = await import("@/lib/stripe.server");
    const { ECARD_SEND_PRICE_ID } = await import("@/lib/ecards-pricing");
    const { tierForSeconds } = await import("@/lib/music-studio-pricing");
    try {
      const env = await resolveDemoSafeStripeEnv(data.environment);
      const stripe = createStripeClient(env);
      // The kind decides which price ladder applies (speech is cheaper than
      // song), so read it from the attached piece rather than trusting the
      // browser. Anything we can't identify falls back to the song ladder, so
      // a card can never be under-charged.
      let musicKind: "song" | "poem" | "letter" = "song";
      const attachedPieceId = (card as { music_piece_id?: string | null }).music_piece_id;
      if (data.musicSeconds && attachedPieceId) {
        const { data: pieceRow } = await context.supabase
          .from("sound_pieces")
          .select("kind")
          .eq("id", attachedPieceId)
          .maybeSingle();
        const k = (pieceRow as { kind?: string } | null)?.kind;
        if (k === "poem" || k === "letter") musicKind = k;
      }
      const musicTier = data.musicSeconds ? tierForSeconds(data.musicSeconds, musicKind) : null;
      if (data.musicSeconds && !musicTier) return { error: "Pick a music length between one and four minutes." };
      const lookupKeys = musicTier
        ? [ECARD_SEND_PRICE_ID, musicTier.priceKey]
        : [ECARD_SEND_PRICE_ID];
      const prices = await stripe.prices.list({ lookup_keys: lookupKeys });
      const sendPrice = prices.data.find((p) => p.lookup_key === ECARD_SEND_PRICE_ID);
      if (!sendPrice) return { error: "Card sending is not available right now." };
      const musicPrice = musicTier
        ? prices.data.find((p) => p.lookup_key === musicTier.priceKey)
        : null;
      if (musicTier && !musicPrice) return { error: "Music isn't on sale right now." };

      // The music charge gets its own record, so the studio knows there is a
      // paid piece waiting to be composed for this card.
      let purchaseId: string | null = null;
      if (musicTier && musicPrice) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: pending } = await supabaseAdmin
          .from("sound_piece_purchases")
          .insert({
            user_id: context.userId,
            ecard_id: data.ecardId,
            price_key: musicTier.priceKey,
            amount_cents: musicTier.amountCents,
            seconds: data.musicSeconds!,
            status: "pending",
            credit_unused: false,
            environment: env,
          })
          .select("id")
          .single();
        purchaseId = (pending as { id: string } | null)?.id ?? null;
        if (!purchaseId) return { error: "Couldn't add music to that payment." };
      }

      const customerId = await resolveOrCreateCustomer(stripe, {
        userId: context.userId,
        email: (context.claims as { email?: string } | undefined)?.email ?? null,
      });

      const session = await createCheckoutSessionWithTax(stripe, {
        line_items: [
          { price: sendPrice.id, quantity: 1 },
          ...(musicPrice ? [{ price: musicPrice.id, quantity: 1 }] : []),
        ],
        customer: customerId,
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: data.returnUrl,
        redirect_on_completion: "always",
        payment_intent_data: {
          description: musicPrice ? "Group eCard delivery with music" : "Group eCard delivery",
        },
        metadata: {
          userId: context.userId,
          ecardId: data.ecardId,
          kind: "ecard_fee",
          ...(purchaseId ? { purchaseId } : {}),
        },
      }, {
        automatic_tax: { enabled: true },
      });
      if (purchaseId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("sound_piece_purchases")
          .update({ stripe_session_id: session.id })
          .eq("id", purchaseId);
      }
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const confirmEcardPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(EcardConfirmInput), d, "input"),
  )
  .handler(async ({ data, context }): Promise<{ paid: boolean }> => {
    const { resolveDemoSafeStripeEnv } = await import("@/lib/demo-mode.server");
    const { createStripeClient } = await import("@/lib/stripe.server");
    try {
      const env = await resolveDemoSafeStripeEnv(data.environment);
      const stripe = createStripeClient(env);
      const session = await stripe.checkout.sessions.retrieve(data.sessionId);
      const meta = (session.metadata ?? {}) as Record<string, string>;
      if (meta.kind !== "ecard_fee") return { paid: false };
      if (meta.userId !== context.userId) return { paid: false };
      if (session.payment_status === "unpaid") return { paid: false };
      const { error } = await context.supabase
        .from("ecards")
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
          stripe_payment_intent_id:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
        })
        .eq("id", meta.ecardId!)
        .eq("organizer_user_id", context.userId);
      if (error) return { paid: false };

      // Music bought alongside the card: release the credit so the studio can
      // compose the piece. The webhook does the same, whichever lands first.
      if (meta.purchaseId) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("sound_piece_purchases")
          .update({
            status: "paid",
            credit_unused: true,
            stripe_payment_intent_id:
              typeof session.payment_intent === "string" ? session.payment_intent : null,
          })
          .eq("id", meta.purchaseId)
          .eq("user_id", context.userId)
          .eq("status", "pending");
      }
      return { paid: true };
    } catch {
      return { paid: false };
    }
  });

export const sendEcardNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
    const { data: card } = await context.supabase
      .from("ecards")
      .select("*")
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { ok: false, error: "Card not found." };
    const row = card as EcardRow;
    if (!row.is_paid) return { ok: false, error: "Please pay the sending fee first." };
    if (!row.recipient_email) {
      return { ok: false, error: "Add the recipient's email address first." };
    }
    if (row.delivered_at) return { ok: false, error: "This card has already been sent." };

    const nowIso = new Date().toISOString();
    await context.supabase
      .from("ecards")
      .update({ status: "revealed", reveal_date: nowIso })
      .eq("id", row.id)
      .eq("organizer_user_id", context.userId);

    const { deliverEcardById } = await import("@/lib/ecards-delivery.server");
    const res = await deliverEcardById(row.id);
    if (!res.ok) {
      return {
        ok: false,
        error: "We could not send the email just yet. Please try again shortly.",
      };
    }
    return { ok: true };
  });

// ---------- Contributor self-service (token based, no login) ----------

export const getMyContributionByToken = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(EditTokenInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ contribution: MyContribution | null }> => {
    const sb = ecardPublicClient();
    const { data: row } = await sb.rpc("get_ecard_contribution_by_token", { _token: data.token });
    return { contribution: (row as MyContribution | null) ?? null };
  });

export const updateMyContributionByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(UpdateByTokenInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sb = ecardPublicClient();
    const { data: res, error } = await sb.rpc("update_ecard_contribution_by_token", {
      _token: data.token,
      _message: data.message ?? "",
      _media_type: data.mediaType,
      _media_url: data.mediaUrl ?? undefined,
      _gif_url: data.gifUrl ?? undefined,
      _image_url: data.imageUrl ?? undefined,
      _video_url: data.videoUrl ?? undefined,
      _audio_url: data.audioUrl ?? undefined,
    });
    if (error) return { ok: false, error: "We could not save your changes. Please try again." };
    const out = res as { ok: boolean; error?: string };
    return out.ok
      ? { ok: true }
      : { ok: false, error: out.error ?? "We could not save your changes." };
  });

/**
 * Contributor removing one of their own attachments from their edit link.
 * Goes through the same independent-column update path, so only the chosen
 * slot is cleared, and the uploaded file behind it is deleted from storage.
 * The reveal lock lives in the database function, so a sent card is refused.
 */
export const removeMyContributionMediaByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(RemoveMediaByTokenInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sb = ecardPublicClient();
    const { data: current } = await sb.rpc("get_ecard_contribution_by_token", {
      _token: data.token,
    });
    const mine = (current as MyContribution | null) ?? null;
    if (!mine) return { ok: false, error: "That edit link is not valid." };
    if (mine.locked) {
      return { ok: false, error: "This card has already been sent, so it can no longer be changed." };
    }
    const slot: EcardMediaSlot = data.slot;
    const next: Record<EcardMediaSlot, string | null> = {
      gif: mine.gif_url,
      image: mine.image_url ?? (mine.media_type === "image" ? mine.media_url : null),
      video: mine.video_url ?? (mine.media_type === "video" ? mine.media_url : null),
      audio: mine.audio_url ?? (mine.media_type === "audio" ? mine.media_url : null),
    };
    const removedUrl = next[slot];
    if (!removedUrl) return { ok: true };
    next[slot] = null;
    if (!String(mine.message ?? "").trim() && !next.gif && !next.image && !next.video && !next.audio) {
      return {
        ok: false,
        error: "This would leave your message empty. Add some words first, or remove the message.",
      };
    }
    const { data: res, error } = await sb.rpc("update_ecard_contribution_by_token", {
      _token: data.token,
      _message: mine.message ?? "",
      _media_type: next.gif ? "gif" : next.audio ? "audio" : next.video ? "video" : next.image ? "image" : "none",
      _media_url: next.audio ?? next.video ?? next.image ?? undefined,
      _gif_url: next.gif ?? undefined,
      _image_url: next.image ?? undefined,
      _video_url: next.video ?? undefined,
      _audio_url: next.audio ?? undefined,
    });
    const out = (res as { ok: boolean; error?: string } | null) ?? null;
    if (error || !out?.ok) {
      return { ok: false, error: out?.error ?? "We could not remove that attachment. Please try again." };
    }
    const path = ecardMediaPathFromUrl(removedUrl);
    if (path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from("ecard-media").remove([path]);
    }
    return { ok: true };
  });

export const deleteMyContributionByToken = createServerFn({ method: "POST" })

  .inputValidator((d: unknown) =>
    parseInput(nullSafe(EditTokenInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const sb = ecardPublicClient();
    const { data: res, error } = await sb.rpc("delete_ecard_contribution_by_token", {
      _token: data.token,
    });
    if (error) return { ok: false, error: "We could not remove your message. Please try again." };
    const out = res as { ok: boolean; error?: string };
    return out.ok
      ? { ok: true }
      : { ok: false, error: out.error ?? "We could not remove your message." };
  });
// ---------- Cinematic montage curation (AI intro/outro + running order) ----------

export const curateEcardMontage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    parseInput(nullSafe(SlugInput), d, "input"),
  )
  .handler(async ({ data }): Promise<{ curation: MontageCuration | null }> => {
    const sb = ecardPublicClient();
    const { data: row } = await sb.rpc("get_ecard_reveal", { _slug: data.slug });
    const reveal = (row as RevealPayload | null) ?? null;
    if (!reveal) return { curation: null };
    const { buildMontageCuration } = await import("@/lib/ecards-montage.server");
    return { curation: await buildMontageCuration(reveal, process.env.LOVABLE_API_KEY) };
  });

export const curateEcardMontagePreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data, context }): Promise<{ curation: MontageCuration | null }> => {
    const { data: card } = await context.supabase
      .from("ecards")
      .select("occasion, recipient_name, theme, reveal_date")
      .eq("id", data.id)
      .eq("organizer_user_id", context.userId)
      .maybeSingle();
    if (!card) return { curation: null };
    const { data: rows } = await context.supabase
      .from("ecard_contributions")
      .select("id, contributor_name, message, media_type, media_url, gif_url, image_url, video_url, audio_url")
      .eq("ecard_id", data.id)
      .eq("is_hidden", false)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    const row = card as { occasion: string; recipient_name: string; theme: string; reveal_date: string };
    const reveal: RevealPayload = {
      occasion: row.occasion,
      recipient_name: row.recipient_name,
      theme: row.theme,
      reveal_date: row.reveal_date,
      revealed: true,
      contributions: (rows ?? []) as RevealPayload["contributions"],
    };
    const { buildMontageCuration } = await import("@/lib/ecards-montage.server");
    return { curation: await buildMontageCuration(reveal, process.env.LOVABLE_API_KEY) };
  });
