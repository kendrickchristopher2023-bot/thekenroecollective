# Themes v2 + Host Image Art (envelope, invite, frame)

Two builds in one pass, then a hardening list.

## 1. Finish the theme library (content on the existing system)

Add ~19 more themes to `src/lib/event-themes.ts` using the existing tagged
structure (frame id + accent + tags). No new plumbing, no per-theme branches.

New themes, grouped by the tags they already use:

- Milestones: anniversary, engagement party, bridal shower, retirement, quinceanera, sweet sixteen, baptism/christening
- Seasonal: holiday party, new year's eve, thanksgiving, halloween, spring garden party
- Social: cocktail hour, game night, wine tasting, brunch, housewarming
- Work: conference / summit, fundraiser / gala

Where a theme needs a look the current six frames can't carry, add the frame
style to `src/lib/event-frames.ts` (pure CSS, same responsive inset/band
pattern) and reuse it across related themes. Expected new frame styles: a
seasonal garland band, a deco chevron rule, and a soft botanical corner.

The picker in the "Make it pretty" dashboard step gains tag filter chips so 30
themes stay browsable on a phone instead of an endless scroll.

## 2. Host image art: uploader used on the envelope and the invite

Today the host can upload a hero photo and a logo. This adds a third,
deliberately separate slot: **theme art** — a decorative image the host owns,
rendered as invite backdrop and on the envelope opening animation.

New optional fields on `KEvent`:

- `themeArt?: string` — storage URL of the uploaded art
- `themeArtMode?: "background" | "frame" | "envelope-only"` — how it is used
- `themeArtOpacity?: number` — 0.15 to 1, default 0.35 for background mode

Upload path reuses `uploadAndRecord` (object storage, no base64 in the event
blob) and the existing media picker, so the host can also pick art they already
uploaded. Same 8MB ceiling and retry toast as the hero photo.

Rendering:

- **Background mode**: art sits behind the hero at the chosen opacity with a
  paper-toned scrim on top so the title always passes contrast. `object-cover`,
  fixed hero height, so no page-length surprises.
- **Frame mode**: art is repeated as top and bottom decorative bands (phone) or
  a four-edge border (>=1024px), masked with a soft fade so it reads as a frame
  rather than wallpaper. Layered through the existing `InviteFrame` slot so a
  curated frame and custom art never both render.
- **Envelope-only**: art skins the envelope body and flap in
  `InviteEntrance`, replacing the flat accent gradient, with the wax seal kept.

The envelope also picks up the art in background and frame modes, so opening the
invite and reading it feel like one piece.

Guardrails: theme art is Whisper+ (same gate as frames), it is never used as the
OG/social image (hero photo stays authoritative), and clearing it never touches
the hero or logo.

## 3. What I recommend beyond this, to make it bullet proof

Ranked by real risk, matching the motto — proportional, luxurious, and never
lose a host's work:

1. **Save-failure guard rail.** The recent sync outage was invisible until a
   banner appeared. Add a persistent "unsynced changes" indicator with a manual
   Retry and a one-click download of the local copy, plus an owner alert when
   any host's save fails more than twice in an hour.
2. **Event blob size budget.** Enforce a soft ceiling in `upsertEvent` and warn
   the host at 80%, so no future feature can quietly push an event past what a
   single row should carry.
3. **Signup abuse.** `disposable_email_domains` exists but nothing reads it.
   Wire it into signup so banned users cannot return on a throwaway address.
4. **Invite render regression test.** A Playwright check that the invite has no
   horizontal scroll and no clipped art at 390 / 1280 / 2560, run on every
   change, so the proportion work stops regressing.
5. **Guest-side reliability**: an offline-safe RSVP that queues and retries, and
   a plain "your RSVP was received" state, since guests get one shot.
6. **Owner visibility**: surface `admin_audit_log` in the owner console as a
   readable timeline, not just a table nobody opens.

## Verification

Real screenshots at 390, 1280 and 2560 for: theme picker with filters, invite
in each of the three art modes, and the envelope animation. Live check on a real
event with an uploaded piece of art. Types plus full test run. Nothing published
until you say go.
