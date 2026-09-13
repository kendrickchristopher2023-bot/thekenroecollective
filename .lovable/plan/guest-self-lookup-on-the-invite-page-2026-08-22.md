# Guest self-lookup on the invite page

## What happens today (tested live on a real invite)

The "find your name" box matches only:
- exact email, exact full name, or a phone number (last-4 or better), or
- a single whole name token that resolves to exactly one guest.

Live results on a real invite with guests Wren Alvarez, Malik Osei, Delphine Roy, Arjun Mehta:
- "Wren" found, "Alvarez" found, "Wren Alvarez" found
- "Wre" not found, "Malik Ose" not found

So prefixes, typos, nicknames, and middle-name variants dead-end. "Chris" would only find "Christopher Kendrick" if the stored token is exactly "Chris".

The failure message says "contact the host" but gives no host name, email, phone, or any button. It is a true dead-end for a guest who arrived from a forwarded link.

## Proposed design

### 1. Tiered matching, safest first
1. Exact email / phone (unchanged).
2. Exact full name (unchanged).
3. Whole-token match, unique (unchanged).
4. New: prefix match on any name token ("Wre" to "Wren", "Chris" to "Christopher").
5. New: fuzzy match with one-character tolerance (edit distance 1 on a token, plus common apostrophe/accent/hyphen normalization) for typos like "Delphin Ro".

Rule kept from today: a match only auto-opens the RSVP when it is unique. Never open a stranger's RSVP.

### 2. Disambiguation instead of an error
When 2 to 5 candidates match, show a short "Is this you?" list with masked identity hints (for example "Wren A. - w****z@gmail.com", "Malik O. - (***) ***-1234") and let the guest tap themselves. More than 5 candidates asks for a fuller name, as today.

Masking rule: show first name + last initial, first and last character of the email local part, last 4 digits of a phone. Never render a full email or phone in the picker.

### 3. Real "Can't find your name?" fallback
Replaces the dead-end text with a small panel offering, in order:
- Host contact, when the host chose to share it: host name plus a mailto/tel link built from the event's host fields.
- "Ask the host to add me" form: name, email or phone, optional note, plus party size. This creates a pending request the host reviews.
- Copy-the-link-back guidance for guests who think they were invited under a different address.

### 4. Host side: pending guest requests
- New table `event_guest_requests` (event_id, name, contact, note, party_size, status, created_at) with RLS: public insert (rate limited by event and IP-less token bucket in the server function), host/co-host select and update, no anon select.
- Requests appear in the Guests step as "Requests to join (2)" with Approve (adds them to the guest list and opens their RSVP link) or Dismiss.
- One email notification to the host per request, batched to at most one every few minutes per event.

### 5. Open-guest-list events (optional switch, default off)
An event setting "Anyone with the link can RSVP" that lets a guest add themselves directly, for broadly shared invites where the host does not want to curate. When on, the fallback becomes a direct add rather than a request. Capacity and tier caps still apply.

## Technical notes
- Matching logic moves into `src/lib/guest-lookup.ts` with unit tests (prefix, typo, unique/ambiguous, masking), so the invite page just renders results.
- Invite page changes stay inside `src/routes/invite.$eventId.tsx`: candidate picker plus fallback panel.
- Requests use a `createServerFn` in `src/lib/guest-requests.functions.ts`; public insert path validated with Zod, no admin client.
- Migration creates the table with GRANTs (anon insert only, authenticated select/update through policy) plus RLS policies.
- Email notification reuses the server-side enqueue path and a registered template.

## Not included
- No change to the personal-link flow, which keeps bypassing lookup entirely.
- No public exposure of the guest list; only masked hints for candidates that already matched the guest's own input.
