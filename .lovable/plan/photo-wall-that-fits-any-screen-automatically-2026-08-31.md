# Photo Wall that fits any screen automatically

Right now the wall has exactly two looks: a small one and a TV one you have to pick by hand with the "TV mode" link. Everything overlaid on the photo (the title card, the QR panel, the counter, the music transport, the AI concierge bubble) is a fixed size, so on a laptop it crowds the photo and runs off the right edge, and on a phone it overflows behind the browser bar.

## What you'll get

**1. It sizes itself to the screen it's on**

The wall picks a display size on its own the moment it opens, and again if the window resizes or the phone rotates:

- Phone: compact chrome, small QR, transport controls sized for thumbs, safe distance from the notch and home bar.
- Tablet: mid-size chrome.
- Laptop or desktop monitor: the current default, tightened so nothing overlaps or clips.
- TV or projector (large screen, no mouse, or the existing `?tv=1` link): the big look, cursor hidden, screen kept awake.

Detection uses the actual window size, the screen size, whether there's a mouse or a touch screen, and pixel density, not the user agent string, so a laptop plugged into a projector still reads as big-screen.

**2. One dial instead of dozens of fixed sizes**

Every overlay is sized from a single scale value for the chosen display, so the title, QR, counter, and music bar always stay in proportion, and text never collides with the photo edges.

**3. You can still override it**

A small size control (Phone / Laptop / TV / Auto) in the wall's top-right corner, remembered per device. The existing "TV mode" link keeps working. A Fullscreen button is added next to it, since a laptop screen looks best with the browser chrome gone.

**4. The overlap in your screenshot gets fixed**

The QR panel, the music transport, and the AI concierge bubble are put into one bottom layout that reserves space for each, so the concierge no longer sits on top of the QR panel or hangs off the edge. On a phone the QR panel collapses to a small "Scan to add photos" chip, since a phone is not the screen guests scan anyway.

**5. Height that doesn't overflow on phones**

Full height uses the modern viewport unit and safe-area padding, so the slideshow fills the screen without hiding controls behind the browser bar or the iPhone home indicator.

## Also recommended (included)

- **Photo fit choice**: keep the current "whole photo visible with a soft blurred backdrop" as default, and add a "fill the screen" option for hosts who prefer edge-to-edge on a TV.
- **Fewer, bigger elements on small screens**: on a phone, the title card and counter fade after a few seconds so the photo has the screen.
- **Idle hide everywhere**: the auto-hide of the cursor and chrome after a few idle seconds applies to laptops too, not just TV, so a laptop on a stand looks clean.
- **Remote and keyboard control**: arrow keys and a TV remote's left/right move between photos, space pauses. Useful when someone wants to hold on a photo.
- **Slide pacing per screen**: slightly longer holds on a big screen, slightly shorter on a phone, still snapped to the music's beat as it is today.

## Technical notes

- New `src/hooks/use-display-class.ts`: returns `"phone" | "tablet" | "laptop" | "tv"` from a `matchMedia` set (`min-width`, `pointer: coarse/fine`, `min-device-width`), re-evaluated on `resize` and `orientationchange`, with an `auto | phone | laptop | tv` override read from `localStorage` and from the existing `?tv=1` search param. SSR-safe default of `laptop` with the real value applied after hydration to avoid a mismatch.
- A small `WALL_CHROME` table maps each display class to scale tokens (padding, QR size, font steps, rotate interval). `src/routes/wall.$eventId.index.tsx` replaces its `isTv ? ... : ...` ternaries with lookups from that table, so there is one source of truth for sizing.
- Bottom overlays move into one flex/grid container with explicit ordering and `min-w-0`, so the QR block, transport, and concierge bubble share the row instead of stacking on top of each other; concierge gets a bottom offset from the same table.
- Root container switches to `h-[100dvh] w-screen` plus `env(safe-area-inset-*)` padding on the chrome layer.
- `slideMsForTrack` keeps beat snapping; only its base interval comes from the display table.
- Keyboard/remote handlers on the wall container (ArrowLeft/ArrowRight/Space), reusing the existing idle-bump listener.
- Fullscreen button calls `requestFullscreen` on the wall container with a graceful no-op where unsupported.
- Verification: Playwright screenshots of the wall at 390x844, 820x1180, 1280x800, and 1920x1080 to confirm no clipping or overlap at any size, plus the existing test suite.
- `roadmap.md` gets this task recorded when implementation starts.
