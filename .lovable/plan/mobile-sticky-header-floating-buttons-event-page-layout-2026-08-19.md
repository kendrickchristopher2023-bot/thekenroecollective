# Mobile: sticky header, floating buttons, event page layout

## What I confirmed live (440x673 mobile viewport)

1. **The header Menu button really does scroll away.** The header is marked
   sticky, but `src/styles.css` line 306 sets `html, body { overflow-x: hidden }`,
   which turns the page into a scroll container and silently kills
   `position: sticky`. Measured: the header's top edge moves to -400px, -1200px,
   -2000px as you scroll. So on mobile you get the header Menu at the top, it
   vanishes on scroll, and only the bottom tab bar Menu remains. That is the
   appear/disappear you are seeing.
2. **The floating buttons sit on top of real content.** On a 673px-tall screen:
   AI chat bubble at y 537-585 (bottom-left), "+" action dock at y 529-585
   (bottom-right), bottom tab bar starts at y 616, and the cookie notice
   occupies y 475-617. Both bubbles land inside the cookie notice band and over
   the hero's "Create New Event" / "Open Dashboard" buttons. That is the "screen
   is off" look.
3. **Two Menu buttons compete.** Header Menu (top right) and tab bar Menu
   (bottom right) open different things, on the same screen.
4. **Event page not yet verified.** The preview session is signed out on my
   side, so I could not open an event detail page. Verifying it is step 1 of the
   work, not an assumption.

## The fix

### Sticky header
Change `html, body` from `overflow-x: hidden` to `overflow-x: clip` in
`src/styles.css`. Same horizontal-overflow protection, but sticky keeps working,
so the header (and its Menu button) stays pinned while scrolling instead of
flickering out of view.

### Floating controls, mobile only
- Raise both floating buttons so they clear the bottom tab bar with real
  breathing room, and shift them up further while the cookie notice is on
  screen so nothing overlaps it.
- Keep the "+" action dock as the primary right-side control. Make the AI chat
  bubble smaller and visually secondary on the left so it reads as a helper, not
  a second primary action.
- Add bottom padding to page content on mobile so the last CTA on a page is
  never sitting under a floating bubble.

### Duplicate Menu
Keep one. Recommendation: drop the header Menu button on mobile and let the
bottom tab bar Menu be the single mobile menu entry point, since it is always
reachable with a thumb. The header keeps the logo and stays uncluttered.

### Event page
Open an event on mobile, screenshot it, and fix whatever the layout problem
actually is there (likely the same floating-button collision plus the sticky
sidebar column at `top-24`, which will behave differently once sticky works
again). Any additional cause found gets reported before changing behavior.

## Also recommended (say which you want)

- Rely on the tab bar plus a top-of-page trigger only, and remove the floating
  chat bubble entirely on mobile, if you prefer a cleaner screen.
- Give the cookie notice a one-time dismissal that persists, so it stops eating
  a fifth of the viewport on repeat visits.
- Audit every other page for content hidden behind the tab bar, same 20px
  bottom padding rule.

## Verification before I report back

Real mobile screenshots at 390px and 440px: header pinned at scroll positions
0 / 400 / 1200, no button overlapping the cookie notice or any CTA, chat bubble
opens the concierge, and an event detail page rendering correctly.

Nothing published without telling you first.
