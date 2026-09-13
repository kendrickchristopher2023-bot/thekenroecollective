# Roadmap: demo safety, showcase lock, first-time example

## Urgent before Sunday family demo (12 Sep)
- [x] Kept the exact title “The Kendrick Family Reunion”. Replaced every person inside `demo-reunion-200` and `demo-evt-supper` with invented people, using fictional Kendrick relatives and in-laws for the reunion. Preserved example.com emails and 555-01xx phones.
- [x] Replaced both events’ cover/host/wall photos with generated fictional imagery and removed personal-folder pointers. Updated live rows, nightly snapshots, and seed source.
- [x] Changed every guest-facing new-voice label to “A Southern Gentleman”; no purchased Edwin pieces existed.
- [x] Recorded before/after counts, exercised both snapshot restores, and proved retired names and personal-folder media references are absent. Not published.

## Current run (ordered, 11 Sep 14:42 UTC), then stop and report
1. [x] Brand page lock: footer link out, page in owner console (Brand kit tab), server lock via OWNER_REPORT_ALLOWLIST (no 2FA), owner-only zip + card list, private storage for the pack, noindex, public-site logos stay public. Owner-console tab wiring pinned by tests/unit/owner-brand-tab.test.ts; the tab strip itself sits behind the live authenticator code, so Christopher confirms the "Open the Brand kit" button by eye.
2. [x] Application Kit rename: 27 mentions in src, public/llms.txt, and the ventures row (11 Sep). Owner report venture label + revenue-name match renamed together.
3. [ ] (next publish) Part 1 leftovers: demo-invitation banner; refuse outsider RSVPs/wishes/uploads on demo events; refuse exports + AI generation for demo callers everywhere; copy-protection on duplicates; isDemoRequest must read the same verified identity as the auth middleware and no cookie/service-authenticated request skips the demo check.
4. [x] Part 3 (11 Sep, unpublished): read-only host view at /example/host (src/routes/example.host.tsx, data via fetchExampleHostView, shaped by src/lib/example-host-view.ts so no contact detail leaves the server), every control disabled, one calm line, back bar on both the example and the invitation, example_host_view / example_create tracked with a verified bearer only, noindex, not in sitemap. Empty state now points at /example/host. Tests: tests/unit/example-host-view.test.ts. Verified signed-out in a browser at 1280 and 390; a signed-in customer with no events was not exercised with a throwaway account (no account created this run).
5. [x] Demo leftovers (11 Sep): guest CSV export hidden for the demo account / demo events (verified signed-in identity, not the cookie); Sound Studio gate shared in src/lib/studio-gate.ts and pinned by tests/unit/studio-owner-gate.test.ts (all compose/write/preview/buy functions refuse non-owners while music_studio_public is false, which is the live value). Owner console Exit demo signs out only the demo account (tests/unit/demo-exit-and-export.test.ts).
5. [~] IN PROGRESS (11 Sep 15:50 UTC): baseline saved /tmp/qa-pass/baseline.txt; throwaway account 88e5a198-70fe-4dc1-bc2f-4737bce65967 qa-publish-check@example.com created (confirmed, no email; profile host + thank_you_cards_enabled; manual_host sandbox subscription). Steps 2-9 not yet run. Tests as real people (approved by Christopher 11 Sep 15:40 UTC, one throwaway account qa-publish-check@example.com, deleted after): record owner report counts first; setup (confirm no email, Host tier + thank-you studio server-side); customer saves (3 guests incl. long apartment address + no address, 2 wall photos, several saves); co-host save via Christopher hotmail as DB-inserted member (no invite email); copy protection (showcase URL + real-event URL refused, rest of save kept); print at home (4 PDFs, no-address guest listed, per-guest QR opens only that guest); Brand page as customer (refused, 401 zip, no console) and as Christopher; demo with cookie cleared (send invite, checkout, invite co-host, export guests, song audition all refused + logged in demo_guard_log; demo event saved as demo); no sends (email_send_log + sms_outbox); cleanup (account, event, guests, photos, uploads, thank-you links, storage files, demo test event, co-host row) and counts match. Never touch sm7eduqe. Then publish-safety verdict. Do not start steps 3/4 or Part 4.



## Done (this session, unpublished)
- Demo contact scrub: reunion (210 guests + 3 hosts), supper (5 guests + 2 hosts), showcase phones, one supper join request, and the reset snapshots now use example.com / (555) 555-01xx. Seed code phone format fixed.
- Migration: `is_demo_user()`, events auto-flag `is_demo` for demo accounts, no `event_members` rows for showcase/demo events (existing showcase rows removed), service-only `adopt_showcase_event()`, public event lookups return `isDemoInvitation`, `demo_guard_log`, `demo_event_snapshots` (reunion + supper captured), `showcase_interactions.user_id` + example kinds, `demo-guard-digest-daily` cron (11:35 UTC).
- `isDemoRequest()` is identity-aware (bearer claims: demo email / known id / showcase system account); cookie and host can only add restrictions.
- Stripe: `createStripeClient()` forces sandbox on any demo request (all ~20 call sites covered).
- Email: `enqueueTransactionalEmailServer` refuses demo callers, the showcase, and any `is_demo` event (also from jobs). SMS: `queueSms` identity-aware; join-request SMS refused for demo/showcase; outbox drain parks demo rows as `skipped_demo`.
- Jobs skip `is_demo` + showcase: auto-thankyous, rsvp-reminders, payment-reminders, event-reminders, guest-data-cleanup, comment-digest, join-request-reminders, dispatch-announcements.
- demoSignIn: IP rate limit (6 / 10 min), no refresh token handed out (session <= 1 h), sign-ins logged.
- Collaborator invite/resend refused for demo account and showcase (server + DB trigger).
- Owner scopes exclude both demo host and showcase system account (`excludeUserIds`).

## Open
- [ ] Create the showcase system account and adopt the event: `ensureShowcaseAccount()` exists in `demo-accounts.server.ts`; wire `showcase-seed.server.ts` to use it (replace `findDemoUserId`) and run `adopt_showcase_event`.
- [ ] Nightly reset: restore reunion + supper from `demo_event_snapshots` (delete child rows: wishes, comments, photos, bring items/claims, guest requests, members, invite opens) instead of preserving them.
- [ ] Demo callers: refuse exports (`getHostMasterReportData`, `getEventFullReport`, `emailEventReport`, `emailReconciliationReport`, `exportContactsCsv`) and generation (`studioCompose/Words/Write`, `lengthPreview/Compose`, `letterWrite/Compose`, `generateInviteArt`, `generateAiPackage`, `transcribeBrief`, `aiRewriteCopy`, `draftCommunication`; add auth to `translateBatch`). Serve showcase song/voice note as prepared samples.
- [ ] `regenerateInviteNarration`: showcase only from owner console (`assertOwnerAccess`); skip public generation for `is_demo` non-showcase events.
- [ ] Demo invite page: banner from `isDemoInvitation`; public writes (RSVP, quick RSVP, check-in, walk-in, wishes, comments, bring claim/suggest, photo upload) refuse when event `is_demo` and caller is not the demo session.
- [ ] Freeloading guard in `upsertEvent`: refuse storage URLs whose path belongs to another event / `showcase-wedding/` prefix, and sound pieces not owned by the caller. Client `duplicateEvent` returns null for showcase/demo.
- [ ] Ecard jobs + error-alerts: exclude demo owner ids. Owner report ecards/addons/passes counts: exclude demo owners.
- [ ] Hook `src/routes/api/public/hooks/demo-guard-digest.ts` reading `demo_guard_log` (last 24 h) + demo event-create count > 5 -> `sendOwnerAlert({ kind: "demo_guard_digest" })`.
- [ ] First-time example: empty-state link "See a finished example", `/invite/showcase-wedding?from=events` back bar, read-only host view route, record `example_invite/example_host_view/example_create` with `user_id`.
- [ ] Tests (item 6) with a real non-owner account and a demo visitor; delete test data.
- [ ] Answer item 7 (video rendering) after checking storage limits.

## Decisions (Christopher, 11 Sep)
- The demo stays on at all times. Never switch it off or make it unavailable while closing the holes.
- Print & Mail is gone: hosts print at home, free. We never print or mail anything. No Stripe changes.

## Print at home (queued after the demo list)
- [x] Rename Print channel to "Print at home"; remove cardstock/3-day/queue promises and misleading pricing/privacy/catalog copy.
- [x] Free: remove "Print & Mail add-on (pay-as-you-go)" from UI and entitlements (hasPrintAddon). Thank-you studio plan gating unchanged.
- [x] Output for selected guests: card PDF 5x7 + 0.125in bleed + crop marks, and US Letter 2-up with cut lines; Avery 5160 labels PDF; A7 envelope addressing; missing-address editing; per-guest private QR when media is present; "Mailed" checkbox per guest.
- [x] Showcase offers none of it; demo uses fake addresses only.
- [ ] Test: print at 100%, margins/bleed/crop; Avery alignment; Chrome/iPhone Safari/Adobe Reader; no-address guest; long address with apartment. Screenshots.
- [x] What's New entry: printable thank-you cards and mailing labels, free.

## Print at home: status (build paused mid-way, typecheck clean)
Done: `thank_you_links` table (service-role only), `src/lib/thankyou-print.functions.ts`
(mint private per-guest links, public token read), `src/lib/thankyou-print-export.ts`
(5x7 shop PDF with 0.125in bleed + crop marks, Letter 2-up with cut marks, Avery 5160
labels with start-slot and guide option, A7 envelopes, address parsing), `mailedGuestIds`
on ThankYouCard, shared `drawCropMarks`.
Not done: wiring into the thank-you studio (rename to "Print at home", remove queue/
cardstock/mail copy, address editing + no-address list, Mailed checkboxes, QR only when
media), `/thanks/$token` route, copy in pricing/privacy/brand/cart/addons, removal of
hasPrintAddon UI (no Stripe changes), What's New entry, showcase/demo exclusion in UI,
and the print/label/Chrome/iPhone/Adobe test matrix with screenshots.
Demo hardening this pass: demo-guard-digest hook, showcase "finished example" bar,
demo owners excluded from eCard crons, error alerts, and owner report counts.

## Part 4: homepage collection films (queued after Part 3)

### Start gates
- [ ] Do not begin Part 4 until Parts 1, 2, and 3 are complete and verified. The films must show the finished work from those parts.
- [x] Christopher approved all three scripts as written on 11 Sep 2026. Narration and music may be generated only after Part 4 begins.
- [x] Use A Southern Gentleman (`d4m4BR3VP3E3Iyz1NJSV`, Christopher's licensed Voice Design voice, replaced Edwin 12 Sep 2026) across all three films, with warm, conversational product-film delivery at about 130 to 140 words per minute. If Edwin cannot sustain that pace naturally, use another neutral American voice from the curated list and report the voice used. Never clone a voice.
- [x] The Career collection/product name is `Application Kit`.
- [x] Produce a 1080x1920 (9:16) vertical cut of every film from the same footage.
- [ ] Produce a rough cut of each film for Christopher's review before any final render.

### Homepage placement (14 Sep 2026)
- [x] Public `site-films` bucket (read-only for visitors, service role writes), six films as `<name>-v1.mp4` (video/mp4) and six posters as `<name>-v1.jpg` (image/jpeg), long cache-control.
- [x] Homepage: `Watch the film` pill per collection, full-screen player (upright under 768px or portrait, wide otherwise), first-click doorway for signed-out visitors with per-film `kc_film_seen_<key>_v1` flag. Config in `src/lib/site-films.ts`, player in `src/components/film-player.tsx`. Tested in preview; not published.
- [x] Follow-up: removed the doubled article from film labels, switched only the wide Application Kit poster to `application-kit-horizontal-v2.jpg`, and kept one Close button on the end screen. Verified in preview; not published.

### Production rules
- Use only real product footage captured from the live site with Playwright. No stock footage, actors, or mock screens.
- Any people or contact details shown must come from the fictional showcase/demo material, use `example.com`, or use an invented Application Kit candidate.
- Keep the Remotion project in a separate folder that is never imported by or bundled into the app.
- Use A Southern Gentleman for all three films unless his natural delivery cannot meet the approved pace; any fallback must be one neutral American voice from the curated list and be reported to Christopher. Never clone a voice.
- Use one low instrumental Sound Studio bed per film, created only after script approval.
- Burn captions into the silent homepage loops. Deliver each full film with a WebVTT track and written transcript.
- Final deliverables per film: 1920x1080 H.264 MP4, WebM, and poster image, each under 8 MB.
- Final vertical deliverables per film: 1080x1920 H.264 MP4 at good upload quality, re-composed from the same footage rather than cropped. Keep captions and key action outside the top 14% and bottom 20% UI-safe zones, and redesign each end card for vertical.
- Add all six MP4 films and their poster images to the Brand page as downloads: three horizontal homepage films and three vertical cuts. Vertical cuts never appear on the homepage.
- Show no prices. Label Sound Studio `Coming soon` and Application Kit `Invite-only`.
- Do not publish. Do not use live Stripe, send real email/SMS, restore data, or touch event `sm7eduqe`.

### Part 2 naming dependency
- [ ] With the Part 2 copy changes, rename the homepage venture row from `AI Resume Wizard` to `Application Kit`.
- [ ] In the same Part 2 pass, replace every other `AI Resume Wizard` reference on this site, including homepage metadata and social descriptions in `src/routes/index.tsx`, while preserving the tagline's meaning.
- [ ] Do not modify the separate Application Kit app as part of this rename.

### Owner-only Brand kit gate (after current work, before Part 4 Brand delivery)
- [ ] Remove the public footer's `Logo files` link and expose the Brand kit only from the owner console, as a tab or owner-only link.
- [ ] Protect `/brand` on the server with the exact `OWNER_REPORT_ALLOWLIST` of Christopher's three accounts and Adrian's two accounts, using verified sign-in but no 2FA requirement. Do not narrow this allowlist without Christopher's approval. Signed-out visitors go to sign-in; signed-in non-owners go home, with no Brand data returned.
- [ ] Replace `/api/public/brand-kit` with an authenticated, allowlisted owner-only download route, then remove the public endpoint.
- [ ] Replace the Brand page's public `listBusinessCards` loader call with an authenticated, allowlisted owner-only server call. Remove `listBusinessCards` if no other caller remains. Preserve the public single-card read used by `/card/$slug`.
- [ ] Before moving files, audit every reference in the header, favicon/manifest, social preview metadata, business cards, generated email signatures, email templates, and absolute `https://` URLs. Keep public only assets genuinely required by public site or email delivery.
- [ ] Keep `kenroe-logo-horizontal-2400px-transparent.png` public while `card.$slug.tsx` and generated email signatures depend on it. Account for the public Open Graph logo used by card metadata, `/favicon.svg`, root social preview, and email favicon references before any move.
- [ ] Move the remaining print, social, and 3:4 Brand pack files from `public/brand` to private storage. Serve owner downloads through short-lived signed links; never expose private object paths through public list APIs.
- [ ] Add `noindex` to `/brand` and keep it out of the sitemap.
- [ ] Add the three horizontal and three vertical Part 4 films, with posters, to this owner-only Brand page only after the access hardening is complete. Vertical films remain off the homepage.
- [ ] Test signed-out, signed-in customer, and allowlisted owner sessions. The first two must see no link and receive no page, zip, card-list, or private-file data. Owners must see the complete kit and successfully download every item.
- [ ] Verify the public header logo, favicon/social previews, public `/card/$slug` pages, card-page logos, and email logo references still load after the file move.

### Footage preparation
- [ ] Showcase: fill the seating chart and add 8 to 12 generated photo-wall images with no real people.
- [ ] Demo Group eCard: add about 12 messages from invented people.
- [ ] Demo Workroom: create `Spring studio relaunch` with about 12 tasks, a few comments, a floor-plan PDF, and `example.com` collaborators.
- [ ] Demo Workroom: create `Amara & Elias wedding production` and link it to the showcase.
- [ ] Application Kit: capture an invented candidate in the separate app. Blur or replace every real employer name in the job feed.

### Film 1: Celebrations (1:00)
- Homepage loop: 0:00-0:07, silent, `Invitations people open.`
- Follow the approved 12-beat brief: showcase envelope/opening, host note, narrated invitation, song, RSVP/bring list, read-only host view/seating, photo wall, thank-you print-at-home, Group eCard, Sound Studio, and Celebrations end card.
- End labels/actions: `Kenroe Sound Studio · Coming soon`, `See a finished example`, and `Start your event`.

### Film 2: The Workroom (0:45)
- Homepage loop: 0:00-0:05, silent, `Production work, without the ceremony.`
- Follow the approved 7-beat brief: task completion, full board, drag between four columns, threaded comment and floor-plan attachment, role sharing/revoke, linked showcase board, and Workroom end card.
- Show `Event links on Host and Atelier plans` during the linked-event beat.

### Film 3: Application Kit (0:50)
- Homepage loop: 0:00-0:05, silent, `Your real experience, in the language of the role.`
- Follow the approved 7-beat brief: résumé rewrite, original/new comparison, openings filters, tailored résumé and cover letter, no-invention promise, tracker/interview/follow-up, mark applied, and invite-only end card.
- Show `Nothing is submitted without you.` and label Application Kit `Invite-only`.
- Use `Application Kit` as the final collection and product name.

### Homepage playback and performance
- [ ] Poster renders first for each collection.
- [ ] Silent opening loop starts only when its collection enters the viewport.
- [ ] Tap opens the full film with sound in a player with a visible pause control.
- [ ] Reduced-motion visitors see only the poster. Data-saver connections never autoplay.
- [ ] Keep film assets out of the initial homepage request so first load is not slower.

### Review and delivery
- [ ] Capture the finished live product states with Playwright and redact any accidental real employer names.
- [ ] Assemble three silent rough cuts in Remotion, with temporary timing only and no narration or music.
- [x] Christopher approved the words as written.
- [ ] Christopher reviews all three rough cuts before final rendering.
- [ ] Once Part 4 begins, generate A Southern Gentleman narration and one instrumental bed per film.
- [ ] Render and verify the three horizontal MP4s, WebMs, posters, WebVTT files, and transcripts against duration, dimensions, size, caption, reduced-motion, data-saver, and first-load requirements.
- [ ] Render and verify three vertical H.264 MP4s and posters at 1080x1920, including top/bottom safe zones, vertical composition, legibility, redesigned end cards, and upload quality.
- [ ] Add all six film downloads and poster images to the Brand page; confirm vertical versions are absent from the homepage.

### Part 4 progress (11 Sep, evening run)
- [x] Showcase invitation: "See the host's view" now shows for every visitor (business-card arrivals included); click counted as `example_host_link`. Test: tests/unit/showcase-host-link.test.ts.
- [x] Footage prep: 10 more generated photo-wall pictures on the showcase (14 total, all `visible`, seeded in src/lib/showcase-seed.server.ts); demo Group eCard "Marguerite Adler, Retirement" with 12 example.com messages (slug demo-marguerite-retires, removed by nightly reset); demo Workroom boards "Spring studio relaunch" and "Amara & Elias wedding production" (15 tasks, 2 comments, floor-plan attachment, 2 pending example.com invites). Board page now resolves a showcase link via the public event shape and opens the sample invitation.
- [ ] Film 1 and Film 2: capture, A Southern Gentleman narration, music bed, captions, 16:9 and 9:16 rough cuts. Not started. `films/` holds the standalone Remotion project scaffold (package.json + installed deps only, no compositions yet, never imported by the app).
- [ ] Rough cuts on the owner-only Brand page.
- [ ] Film 3 needs a demo candidate login in the separate Application Kit app (see report).
- ElevenLabs spend this run: 0 characters (no narration or music generated yet).

### Part 4 progress (this run, films 1 and 2)
- Narration: Edwin, 17 segments, 1,078 characters, speed 0.9 (v1 at 1.0 kept in /tmp/films/audio/v1). Music: two Sound Studio instrumental beds, 60 s (celebrations) and 45 s (workroom). Both live in /tmp/films/audio, not in the app.
- Data prep done: showcase system account (owner of the sample wedding) set to the Atelier tier so its photo wall is switched on for footage; one more invented comment ("Florist confirmed for 3 pm, see the floor plan.") on the demo wedding board's floor-plan task. Demo host tier is Atelier, so the thank-you studio is visible on the reunion; the print-at-home files are refused on sample events by design, so the label/QR beat will be shown from files built with the real export code and fictional guests.
- Screen maps captured for the invitation (phone), example host view, photo wall, eCard, Workroom boards and Sound Studio. Owner session for the Sound Studio scene can be minted with the standard tool.
- Not done yet: Playwright footage recording, Remotion compositions in films/, 16:9 and 9:16 rough-cut renders, captions/WebVTT, and the owner-only Brand page previews. If the Group eCard scenes are not filmed before the 04:30 UTC reset, recreate demo-marguerite-retires identically first.

### Part 4 capture log (12 Sep 2026, 03:00 UTC)
- Captured before the 04:30 reset, all in `/mnt/documents/films/footage/`: `f1-ecard-manage.webm` (organizer view, 12 messages, collecting state), `f1-ecard-reveal.webm` (recipient opens, "Read them one by one"), `f1-invite.webm` (+ `.marks.json` timestamps: envelope tap, hero, Play this invitation, narration with captions, song).
- Demo eCard reveal date restored to its original 2026-09-20 22:05:03 UTC value. No other data changed.
- Sample invitation audio saved to `/mnt/documents/films/audio/showcase/` (voice-note.mp3, song.mp3) for the mix. Capture scripts saved to `/mnt/documents/films/scripts-py/`.
- Still to capture: host view (/example/host), seating, photo wall, print-at-home label/QR beat (offline, fictional guests), Sound Studio, all Workroom scenes. Then Remotion compositions, both aspect ratios, captions/WebVTT/transcripts, four rough cuts to the owner-only Brand page.
- Open report-accuracy issue unchanged: owner_analytics_snapshot_v2 excludes only one UUID; listUsersAsOwner does not filter demo/showcase users.

### Part 4 capture log, 12 Sep 2026 (later run)
- Footage now complete for Films 1 and 2 under /mnt/documents/films/footage: f1-invite, f1-ecard-manage, f1-ecard-reveal, f1-host, f1-seating, f1-wall, f1-thanks, f1-studio, f2-landing, f2-board (task dragged To Do -> In Progress, then dragged back), f2-task (attachment + 3 comments), f2-members, f2-link. Each has a .marks.json of timestamps.
- Print-at-home beat produced with the real export code and fictional guests: footage/print/ (cards-letter, card-shop, labels-avery-5160, envelopes-a7, PDFs + PNGs). Temporary script removed from the app.
- On-screen prices to crop out during assembly: /music "What a piece costs" section (between hero and composer), /workroom hero price line, Members drawer add-on notice. /projects list shows an upsell for the demo host, do not use.
- ElevenLabs usage (true, from account ledger): narration 4 full takes x 17 segments; 4,312 characters submitted, ledger charged 296 per take = 1,184. Music: two generation runs (Sep 11 and Sep 12), 60s + 45s each, 3.50 minutes generated, 721 credits per run = 1,442.
- Still to do: Remotion compositions in films/ (deps installed), 16:9 + 9:16 renders with captions, WebVTT/transcripts, four rough cuts on the owner-only Brand page. Owner-report showcase exclusion still unresolved.

## Film fixes (13 Sep 01:31 UTC), in order, upload each cut before the next
- [x] 6. Deleted analyze_content.py and find_content.py (nothing imported them).
- [x] 1. Re-record c-live-invite.webm with Noto Color Emoji so the sparkle pill renders; reset c01 to c04 starts (envelope then Play card, Play card, Play card then Now playing 1 of 3, Now playing 3 of 3); delete analytics rows the recording adds.
- [x] 2. Celebrations wide c10: label fully opaque, form as a panel with the label above it.
- [x] 3. Celebrations upright c05: panel ends between guest rows.
- [x] 4. Celebrations upright c07: sharp wall photo (full-res photo with slow zoom or smaller crop).
- [x] 5. Workroom wide w02: no column cut at either edge, keep the card move.
- [x] Re-render + audit + upload: celebrations-horizontal, celebrations-vertical, workroom-horizontal.
- [x] AK upright: a04 header fully in; a06 label dropped on upright; re-rendered, audited, uploaded (13 Sep 01:53)
- [x] Re-uploaded six films as video/mp4 (same bytes, sizes verified); deleted analyze_frames.py (13 Sep 02:03)
- [x] Complete US English sweep across visible UI, templates, AI writing prompts, ventures, updates, legal copy, and demo data; preserve customer words and locked showcase except the approved Bishop message.
- [x] Finish missed US English wording and persist the Workroom demo board corrections through reset.
- [ ] Workroom v3: restore approved w03 to w05 shots, show the w02 drag, restore readable upright board framing, create clean v3 posters, audit every line start/midpoint, upload v3 without changing homepage config or deleting v1/v2.
- [ ] Workroom demo reset: wording-update errors must log and continue.

## Storage listing privacy, approved 13 Sep
- [ ] Confirm no browser-side SELECT-dependent calls for event-photos or ecard-media.
- [ ] Drop broad SELECT policies for event-photos, ecard-media, and site-films in an applied migration.
- [ ] Verify anonymous bucket listing is blocked while known public object URLs still load.
- [ ] Exercise demo-only wall photo upload/delete and eCard photo/voice uploads, then remove all test files and rows.
- [ ] Confirm storage mirror and nightly backup still use privileged access.

## Workroom film v3, after storage privacy
- [ ] Keep the approved horizontal v2 film bytes unchanged and upload them under the horizontal v3 name.
- [ ] Rebuild upright w01/w02 stills with both columns complete and a true post-drop state, then render and audit the upright v3 cut.
- [ ] Render captionless clean-board v3 posters from the composition, not decoded MP4 frames.
- [ ] Upload four new site-films v3 files with correct types and one-year cache, without overwriting v1/v2 or changing homepage v1 config.
- [ ] Update Brand Kit Workroom films and sheets to v3, retaining v1 copies.
- [ ] Inspect both cuts at every line start and midpoint plus both full posters, then report sizes and times checked.
