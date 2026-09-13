# Potluck exports + a reusable "you just finished this" upgrade moment

## Part 1 — exports and fillable template (built, live-tested)

Done and verified in the running app on the What to bring panel (Nice touches step):

- **PDF** (jspdf + autotable), **Excel** (SheetJS, Sign-ups sheet plus a Summary sheet), **Word** (docx) exports of the live sheet, grouped by category with spots filled, who signed up, what they're bringing, and notes.
- **Download template** produces the same style of workbook the guest list import already uses: an `Items` sheet with `Item Name, Category, Spots Needed, Serves, Note`, styled frozen header, sample row, plus an `Instructions` sheet listing the valid categories and caps.
- **Import .xlsx** reads that file back, normalizes categories (label or id, fuzzy match, unknown falls back to Other), clamps spots to 1-20 and serves to 1-500, truncates names/notes to the exact server caps (120/300), skips nameless rows, reads at most 200 rows, and batches inserts through the existing `addBringTemplate` server function so RLS and the 200-item list cap still apply.

Live result: all four files downloaded; a filled template round-tripped and imported two items which persisted across reload; no horizontal overflow at 390px.

Note: my import test left two rows ("Imported Brownies", "Imported Ice") on the *Payment UI Test* event. Delete those from the panel when convenient, or say the word and I'll remove them.

## Part 2 — current state of tier selection (actual, from the code)

**Signup**: `/signup?plan=...` is only a display string. It defaults to `"host"` when absent and is stored as user metadata; nothing is charged and no entitlement is granted. Plan choice at signup is cosmetic.

**Entitlements**: unauthenticated and default state is `tier: "postcard"` (free). Postcard counts as an *active* plan in `src/routes/events.new.tsx`, so **event creation is not paywalled**. The copy on that page even says you can choose a plan later.

**Where gates actually bite** — all contextual, after the fact:
- Event cap: Postcard 1 active event, Whisper 1 per month, checked on submit and redirected to `/pricing?next=/events/new`.
- Wizard steps carry flags (`whisperPlus`, `hostAndAtelierOnly`, `atelierOnly`) for Registry, Collect money, Day-of toolkit, Reach & calendar, Share & thanks. Locked steps render `LockedStep` / `UpgradeGateCard`.
- Feature-level gates: guest import (Atelier or $5 add-on), thank-you studio, SMS, converter, branding removal.

So the model you want already mostly exists: free build, contextual upgrade. What's missing is a *positive* moment. Today every upgrade prompt is triggered by hitting a wall (a lock icon, a toast, a redirect to the generic pricing page). There is no "you finished something, here's the next level" surface anywhere.

**Best natural completion points**, in order of conversion value:
1. **Wizard step 11, "Review & save"** — the biggest one. The host has done all the work and is about to send. Nothing celebratory or persuasive happens there today.
2. **Guest list reaching a real size** (say 10+ added) — the moment the free 75-guest ceiling becomes imaginable.
3. **Potluck sheet completion** — first import or first list with 5+ items. Smaller, but a genuine "I built a thing" beat, and the right place to pilot the component.
4. **First RSVPs arriving** / post-event wrap-up — good for retention upsell rather than first conversion.

## Proposed design

A reusable `CompletionMoment` component (`src/components/completion-moment.tsx`) plus a small registry of "moments" (`src/lib/completion-moments.ts`).

Shape of one moment:

```text
[ celebratory eyebrow ]  Your bring list is ready
[ proof block ]          12 items · 7 spots claimed · 5 still open · 4 guests helping
[ what's next, contextual ]
    Now on your plan (Postcard, free)     What Host adds for this
    - Sheet stays live, guests keep       - Text nudges to guests who
      signing up                           haven't claimed anything
    - PDF / Excel / Word exports         - No Kenroe branding on the sheet
    - Unlimited guest sign-ups           - Unlimited events
[ primary: See Host — $X/mo ]  [ secondary: Not now, keep going ]
```

Rules baked into the component, matching your principles:

1. **Never gates anything.** It renders *after* work is saved, is dismissible, and the secondary action is always a plain continue. No feature the host already used is ever revoked or hidden behind it.
2. **Proof first.** Each moment supplies a `stats: {label, value}[]` array rendered above the ask, so the summary of their own work is literally the first thing they read.
3. **Contextual comparison, not the pricing table.** Each moment supplies `youHave[]` and `unlocks[]` strings written for that specific activity, plus a `targetTier` and a deep link to `/pricing?category=events&billing=monthly&highlight=<tier>` so the pricing page opens focused rather than generic. Owners and hosts already on the target tier see a congratulations-only variant with no ask.
4. **Reusable by construction.** The potluck panel and the wizard's Review & save step both render `<CompletionMoment moment={...} />`; the only difference is the moment definition. Guest-count and post-event moments drop in later with a new entry in the registry, no new UI.
5. **Shown once per moment per event**, tracked in `localStorage` (`kc:moment:<id>:<eventId>`), so it feels like a milestone rather than a nag. A "seen" moment collapses to a single quiet line the host can re-open.

Rollout: build the component and the potluck moment first (small, safe, testable), then wire the Review & save moment in a second pass once you've seen the first one in context.

### What I'd change about the brief

- **Reorder the priority.** Potluck-first is right for *building* the component, but the money moment is Review & save. I'd wire both in the same release rather than leaving the big one for "later", since the component cost is already paid.
- **Add one guardrail you didn't ask for**: suppress the moment entirely for owners and for anyone already on the target tier or above. Nothing kills the tone faster than upselling a paying customer their own plan.
- **Skip discount/urgency framing.** Given the brand, "here's what the next tier does for exactly this" reads better than "limited time". No countdowns.
- **One open question**: on the potluck moment, do you want Host framed as the target (SMS nudges, branding removal) or Whisper (more events, cheaper step up)? I lean Host because the nudge feature is the most concrete next thing for a potluck host, but Whisper is the easier yes.
