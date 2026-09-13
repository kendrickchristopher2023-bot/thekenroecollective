# Potluck sign-up sheet (all tiers)

A shared "What to bring" list on each event. The host posts the items needed, guests claim them, and guests can also offer something of their own. Free on every tier, including Postcard.

## How it works

**Host side** (new panel on the event dashboard)
- Turn the sign-up sheet on or off per event.
- Add items: name (e.g. "Brownies"), optional note ("nut free please"), category (Appetizer, Main, Side, Salad, Dessert, Baked goods, Drinks, Ice / supplies, Other), and how many people are needed for it (slots, default 1).
- See who claimed what, with the exact dish they wrote in.
- Reorder, edit, or delete items. Deleting an item that has claims asks for confirmation.
- Toggle "Let guests suggest their own dish" (on by default).
- Toggle "Show who signed up" (on by default; off makes the list show only "claimed" without names).
- Export the whole sheet to CSV, and a "Still needed" summary that can be pasted into an announcement.

**Guest side** (on the public invite page, under the RSVP section)
- "What to bring" list grouped by category, each item showing slots filled (e.g. "2 of 3 claimed").
- Claim an item: name + what exactly they're bringing + optional note (serves 12, vegetarian, etc.). No account needed; the claim is remembered on that device so they can edit or release it later.
- If suggestions are allowed, an "I'll bring something else" box that creates a guest-offered item, marked as a suggestion so hosts can see it came from a guest.
- Full items are shown as claimed and cannot be over-claimed.
- Standalone shareable link (`/bring/<eventId>`) so the sheet works in a text thread or group chat without the full invite page.

## What else I recommend

1. **Automatic "still needed" nudge**: a one-tap host action that messages guests who replied yes but haven't claimed anything, listing the open items. Reuses the existing announcement and reminder plumbing.
2. **Dietary awareness**: show the event's aggregated dietary notes (already collected at RSVP) at the top of the sheet so people bringing food know there are, for example, 3 gluten-free guests. No individual names exposed.
3. **Quantity guidance**: optional "serves how many" on each item so hosts can see whether the dessert table is actually covered.
4. **Suggested starter list**: one-click templates (BBQ, Bake sale, Thanksgiving, Brunch, Office party) that fill common items, matching the existing event templates pattern.
5. **Non-food items too**: same sheet handles ice, folding chairs, coolers, plates, so it doubles as a general "bring list".
6. **Day-of view**: the claimed list appears in the run-of-show / day-of toolkit and the post-event wrap-up, so you can tick off arrivals.
7. **Print / QR card**: include the sheet on the existing QR cards page so guests can scan at the door.
8. **Duplicate warning**: if two guests write near-identical dishes, flag it gently to the second person ("someone is already bringing brownies, still want to?") rather than blocking.

I'd build 1 through 5 with the core feature and leave 6 through 8 as a follow-up unless you want them now.

## Technical notes

- New tables `event_bring_items` and `event_bring_claims`, both with grants plus RLS: host/collaborator full control via the existing `can_edit_event` helper, and public read only through security-definer RPCs.
- Guest actions go through security-definer RPCs (`get_public_bring_sheet`, `claim_bring_item`, `update_bring_claim_by_token`, `release_bring_claim_by_token`, `suggest_bring_item`) mirroring the well-wishes and eCard contribution pattern: token-based edit rights, no anon writes to base tables, profanity masking, IP rate limiting.
- Server functions in `src/lib/bring-sheet.functions.ts` (public reads/writes via the publishable client, host reads/writes behind `requireSupabaseAuth`), host UI in `src/components/bring-sheet-panel.tsx`, guest UI section in `src/routes/invite.$eventId.tsx`, and a public route `src/routes/bring.$eventId.tsx` with its own head metadata.
- Slot counting enforced inside the RPC (count claims against `slots_needed`) so two simultaneous claims cannot oversubscribe.
- Pure logic (grouping, slots remaining, still-needed summary, CSV rows) in `src/lib/bring-sheet.ts` with Vitest coverage.
- No tier gate anywhere: the panel and guest section render for every tier, including Postcard.
