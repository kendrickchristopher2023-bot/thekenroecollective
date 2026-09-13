# Kenroe Sound Studio: paid product, saved pieces, and eCard music

Turn the owner-only studio into a real product with saved pieces, per-length pricing, a concierge request path, and music you can attach to a Group eCard. The public face stays "Coming soon" until you flip one switch.

## Pricing

Auditions (10s, 20s, 30s) stay free. Finished pieces:

- Up to 1 minute: $6.99
- Up to 2 minutes: $9.99
- Up to 4 minutes: $14.99

Music on an eCard costs the same as standalone, charged alongside the $3.99 send fee. Concierge pieces hand-crafted by you are a request form with a "from $149" line, quoted by email, no instant checkout.

Owners (you and Adrian) keep unlimited free composes and downloads, so nothing changes for your own use.

## What guests and customers get

1. **A studio that keeps your work.** Right now pieces live only in the browser. Finished pieces get saved to your account with a title, so they survive a new device, appear in a "My music" library, and can be renamed, re-downloaded, or deleted.
2. **Pay per finished piece.** You audition free, pick a length, and pay only when you want the full piece. The audition you liked carries its exact words and settings into the paid compose.
3. **A shareable listen page.** Every saved piece gets a private link with cover art, title, credit line, and a download button, so it can be sent to anyone without an account.
4. **Attach to a card or an event.** From the library: "Use on an eCard", "Use on an event invitation", or "Use on the Photo Wall". A card with music plays it on open.
5. **Music inside the eCard flow.** When creating or sending a card, an "Add music" step offers your existing pieces or opens the studio to make one. The music price is added at checkout with the send fee, shown as a clear line-item before paying.
6. **A licence line.** Each purchase records what was bought, the length, the price paid, and a plain-language personal-use licence, visible on the piece and in the receipt.
7. **A landing page that sells it.** `/music` gains a small gallery of sample pieces you approve, clear pricing, an FAQ, the concierge card, and an early-access email capture. Public visitors still see "Coming soon" and cannot compose.

## Launch control

One site setting (`music_studio_public`) decides whether the studio is owner-only or open for purchase. It ships off. Owners see it on and can preview the exact buyer experience.

## Also recommended, included here

- Free audition allowance for non-owners once it opens, so costs stay predictable: 5 auditions per day per account.
- Every compose logged with cost and length, surfaced in the owner report so you can see margin per piece.
- Profanity and rights guardrails on submitted words, matching the existing eCard checks, plus a "no impersonating real artists" note in the terms.
- Failure safety: if a paid compose fails, the payment is recorded as an unused credit the customer can spend on a retry, never a silent loss.
- What's New entry and a short tutorial card once you open it publicly.

## Technical notes

- New tables: `sound_pieces` (owner, kind, title, words, settings snapshot, seconds, storage path, licence, source audition, created_at), `sound_piece_purchases` (piece, user, price key, amount cents, session id, status, unused-credit flag), `sound_concierge_requests` (contact, brief, budget, status). Each with GRANTs, RLS scoped to `auth.uid()`, plus a `SECURITY DEFINER` reader for the share link and for a card's attached piece.
- New private storage bucket `sound-pieces`; playback and download go through signed URLs from a server function. Share pages read via the definer function, never a public bucket listing.
- Stripe: three one-time prices `music_piece_1min` ($6.99), `music_piece_2min` ($9.99), `music_piece_4min` ($14.99), and `music_concierge_deposit` created but unused until you quote. All three added to `VALID_PRICES` in `src/routes/checkout.index.tsx` and handled in `src/routes/api/public/payments/webhook.ts`, which marks the purchase paid and releases the piece. Compose happens server-side only after the webhook confirms payment, or against an unused credit.
- `src/lib/music-studio-pricing.ts` becomes the single source of truth for length-to-price mapping, mirroring the `ecards-pricing.ts` pattern.
- `src/lib/music-studio.functions.ts` gains: `saveStudioPiece`, `listMyPieces`, `renamePiece`, `deletePiece`, `getPieceAudioUrl`, `startPiecePurchase`, `composePaidPiece`, `requestConcierge`. Owner bypass keeps the existing `assertOwner` path; everyone else goes through the gate plus the daily audition limit.
- eCards: add `music_piece_id` to `ecards`, an "Add music" step in the create and send flow, the piece price added as a second line item on the send checkout session, and playback on `c.$slug` and the reveal view using the existing audio slot components. The four contribution slots stay untouched.
- Photo Wall reuse stays owner-gated exactly as today; the library "Use on the Photo Wall" action writes into `event_wall_music` through the existing panel logic.
- `src/routes/music.tsx` splits into a public marketing view, an owner studio view, and a `/music/library` route; sample gallery entries come from a small approved list of saved pieces flagged `is_sample`.
- Nothing is published. No real emails or SMS sent. Concierge requests notify through the existing managed-email path to your inbox only.
