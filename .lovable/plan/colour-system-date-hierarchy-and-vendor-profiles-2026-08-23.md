# Colour system, date hierarchy, and vendor profiles

Also done already this turn (not part of the approval): the Photo Wall privacy holes found by the security scan are closed. Photos and background music could be listed for *every* event by anyone hitting the data API. Public reads are now hard-scoped to one event id, and hosts keep full access to their own event.

## 1. One colour system, not three pickers

Today the Design step has a card-colour swatch row plus hex, and a separate frame-colour swatch row plus hex further down, in a different card. Font colour would be a third.

**Change:** a single "Colours" panel with three named roles, same control shape for each (swatch row, colour wheel, typed hex, "Match card colour" reset):

```text
Colours
  Card colour     [swatches] [wheel] [#5B1A3A]        <- the accent everything inherits
  Frame colour    [swatches] [wheel] [#B08D3F]  Match card colour
  Text colour     [swatches] [wheel] [#2A221B]  Match card colour   <- new
  Preview: live mini-invite showing all three together
```

The frame picker stays inside the frame section for context but renders the same shared `ColorField` component, so it looks and behaves identically. Unset always means "inherit the card colour", which is the current behaviour, so nothing changes for existing invites.

New event field `textColor`. It applies to the invite title, the date/time block, and the venue line (venue at 75% of the chosen colour so hierarchy survives), plus the printable PDF and the host-side preview. It never overrides UI chrome, buttons, or body-copy sections that need to stay legible.

### Contrast safeguard

New `src/lib/color-contrast.ts`: WCAG relative-luminance ratio between the chosen text colour and the effective invite background (paper, or the card colour / theme-art tint when one is set).

- ratio >= 4.5 : quiet green "Readable" tick.
- 3.0 - 4.5 : amber "Fine for the large title, hard to read at small sizes."
- < 3.0 : amber warning "Light yellow on ivory will be very hard to read (1.9:1)." with a one-click **Use a readable shade** button that walks the same hue darker or lighter until it clears 4.5:1, so the host keeps their colour family.

Never a hard block, and the same check runs on the frame colour at a lower bar (decorative). Unit tests cover known pairs (yellow-on-white fails, ink-on-paper passes, auto-fix always returns a passing colour).

## 2. Date and time hierarchy

Right now the date is a 12px all-caps line squeezed between the photo circle and the title, and the time is not in the hero at all. Proposed hero ladder, held to a consistent ratio rather than an arbitrary bump:

```text
[ photo circle ]

  ——  MONDAY  ——            small caps, 11px, tracking .3em (weekday as an eyebrow)
  August 31, 2026            font-serif, text-3xl / 4xl / 5xl
  6:30 PM · doors at 6:00    text-sm / base, tracking .2em, muted
  Alexandria's Rooftop       existing venue line
  You're Invited (title)     stays the largest element
```

Title : date : time : venue reads roughly 1 : 0.55 : 0.22 : 0.3, so the date becomes the clear second voice without competing with the event name. Hairline rules flank the weekday so the block reads as a designed unit, and it inherits the new text colour and the body font. Mirrored in the printable PDF one-pager and the host preview so all three surfaces match.

## 3. Vendor profiles

### What already exists

`vendors` already stores `hero_image`, `gallery` (jsonb, unused in the UI), `bio`, `website`, `phone`, `email`, `price_range`. The privacy lockdown from earlier work is intact: `anon` and `authenticated` have **zero** privileges on `vendors`, all public reads go through the `vendors_public` view, and that view only exposes `status = 'verified'` rows, never `email`, `phone`, `owner_user_id`, or review notes. Vendor profiles are already moderated: new profiles are created `pending` and an admin flips them to `verified` before they appear anywhere public.

### New fields

- `logo_url` - separate from the business photo. Logo renders as a contained badge over the hero, hero stays the wide cover photo.
- `address` - optional, free text.
- `show_phone`, `show_address` booleans, **default false**.
- Business description uses the existing `bio`, relabelled "Business description" with a 2000-char counter and rich-ish line breaks. No duplicate column.
- Photo gallery: yes, do it. `gallery` already exists; up to 8 images with drag-to-reorder, hero picked from the set. One cover photo is not enough for a venue or a caterer, and every competitor directory has a gallery.

### Visibility model for the new PII

| Field | Public (anon, signed-out) | Signed-in hosts browsing | Host with an accepted RFQ | Vendor owner / admin |
| --- | --- | --- | --- | --- |
| name, category, city/region, description, website, logo, hero, gallery, price range | yes | yes | yes | yes |
| phone | only if `show_phone` | only if `show_phone` | yes | yes |
| address | only if `show_address` | only if `show_address` | yes | yes |
| email | never | never | yes (via existing verified path) | yes |

Enforcement, not convention:

- `vendors_public` gains `logo_url`, `public_phone` (`CASE WHEN show_phone THEN phone END`), `public_address` (`CASE WHEN show_address THEN address END`). Raw `phone` / `address` / `email` columns are never projected.
- Base tables keep zero anon/authenticated grants. No new grant on `vendors`.
- Full contact for a working relationship keeps going through the existing server function that verifies an accepted RFQ between that host and that vendor.
- The existing recurrence-guard test suite is extended: `address` and `logo_url` handling asserted, `public_phone` / `public_address` proven to return null when the flags are off, and a live check that anon reading `vendors.phone` still fails.
- Vendor Hub copy states plainly that phone and address are hidden until the vendor opts in, and that email is only shared with hosts they accept.

### Website as a CTA

Yes, a real button. Primary-weight pill, "Visit website" with the bare domain underneath, full width on mobile, next to a secondary "Request a quote". `rel="nofollow noopener noreferrer ugc"`, `target="_blank"`, and only `https?:` URLs render (anything else is treated as unset), since this is vendor-supplied content.

### Moderation

Already gated by `pending -> verified`. Two additions worth having: re-review on edit, so changing the description, website, or images on a live profile flips it back to `pending` for a quick admin pass instead of letting a verified listing be swapped for something else, and an admin bell notification when a profile enters the queue so it is not discovered by accident.

## Technical notes

- Migration: `vendors.logo_url`, `vendors.address`, `vendors.show_phone`, `vendors.show_address`; recreate `vendors_public` with the masked columns. Additive only, no rewrites of existing rows.
- New `src/lib/color-contrast.ts` and a shared `ColorField` component used by card, frame, and text colour.
- Invite hero, `src/lib/invite-pdf-export.ts`, and the host preview all read the same date/time block helper so they cannot drift.
- Tests: contrast helper, vendor privacy guard extension, date block formatting.
