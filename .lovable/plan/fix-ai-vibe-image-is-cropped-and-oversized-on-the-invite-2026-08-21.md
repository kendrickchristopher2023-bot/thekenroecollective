# Fix: AI vibe image is cropped and oversized on the invite

## What's actually wrong

Two separate problems in the "THE VIBE" gallery (`InviteGallery` in `src/routes/invite.$eventId.tsx`), both confirmed in the code:

1. **The image is cropped, not shown whole.** Every tile renders with `object-cover` inside a fixed `aspect-[4/3]` box. `object-cover` fills the box and slices off whatever doesn't fit, so a tall or square AI frame loses its top and bottom edges. In the screenshot the decorative arch and floral border are cut off at both the top and the bottom of the card, which is exactly this.
2. **The single-item tile is far too large.** The earlier fix for the "lone image huddling in a corner" problem made a lone item span the full `max-w-5xl` (and `2xl:max-w-7xl`) container. At desktop width that's roughly a 1200x900 block, which dwarfs the rest of the page and breaks the proportional standard.

Fixing only one of these looks wrong: `object-contain` alone leaves a giant letterboxed slab, and shrinking alone still crops.

## The fix

**Show the image whole.** Switch the image (and video-file) rendering from `object-cover` to `object-contain`, so the full artwork is always visible with nothing sliced off. The tile keeps a soft background behind it, so any leftover space reads as a deliberate mat rather than a gap.

**Size it to the art, not to the container.** For a single item, cap the tile at a portrait-friendly readable width (around 30rem, roughly 480px) and center it, instead of letting it stretch the full page width. Multi-item grids keep their current column behaviour, which already looks right.

**Let the shape follow the image.** Rather than forcing every lone item into 4:3, read the image's natural aspect ratio once it loads and apply it to the tile, clamped to a sane range so an extreme panorama or a very tall image can't blow the layout up. Until it loads, a neutral 4:3 placeholder holds the space so the page doesn't jump.

**Keep the AI badge and caption readable.** The caption bar currently sits over the bottom of the image. With `object-contain` it will overlay the mat instead, which is fine, but the gradient gets trimmed so it doesn't cast a dark band across a light frame.

## Verification

Real browser screenshots at 390px, 1280px, and 2560px on a live event carrying an AI frame image, checking specifically that:
- all four edges of the artwork are visible, nothing clipped
- the card no longer dominates the page at desktop width
- no horizontal scroll at 390px
- the multi-image grid (2, 3, 4+ items) is unchanged

## Technical notes

- Single file: `src/routes/invite.$eventId.tsx`, `InviteGallery` (around lines 1995 to 2063).
- Natural ratio comes from the image's `onLoad` (`naturalWidth`/`naturalHeight`) held in local component state, applied via an inline `aspectRatio` style, clamped to roughly 0.6 to 1.9.
- `object-cover` becomes `object-contain` for images; the `group-hover:scale-105` zoom is dropped for the contained case since scaling a contained image crops it again on hover.
- Iframe embeds (YouTube/Vimeo) keep 16:9 and their current fill behaviour, they aren't affected by this bug.
- No data, schema, or business-logic changes. Presentation only.
