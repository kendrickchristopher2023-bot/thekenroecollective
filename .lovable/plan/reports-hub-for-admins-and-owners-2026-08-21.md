# Reports hub for admins and owners

## 1. The "View reports" bug (already fixed, live)

Cause: the button called `jumpTo(summaryIdx)`, and `jumpTo` starts with `if (i === stepIdx) return;`. On the Review & save step you are already on that step, so the click was a no-op. It only ever worked from other steps.

Fix: a `goToReports()` handler that scrolls the reports panel (`id="event-reports"`) into view, and only changes step when you are not already on Review & save. Also closes the mobile Actions menu. Verified live: from Review & save the page now scrolls to the reports panel, and from step 1 it switches step then scrolls, no console errors.

## 2. Where the hub lives

New route `/_authenticated/reports` (URL `/reports`), gated to admin or owner, wrapped in the existing `OwnerMfaGate` like `/admin` and `/owner`. Entry points: a "Reports" link in the Owner console header and on the Admin dashboard, so discovery is one hop from either surface.

Why its own route rather than another tab inside `/owner`: the Owner console already has 15 tabs, and adding a 16th "hub of the other tabs" is exactly the scattered discovery Christopher is complaining about. A dedicated `/reports` URL is shareable, bookmarkable, and can be linked from the event-level Reports panel too.

## 3. What it lists

A simple directory, per your recommendation: grouped cards, each with a title, one-line description, who it is for, and a single button into the real report. No report data rendered on the hub itself.

**Account-wide (owner/admin)**
- Owner Report — headline business snapshot. → `/owner?tab=report`
- Revenue — subscriptions, MRR, plan mix. → `/owner?tab=revenue`
- Payment reconciliation — billed vs collected vs outstanding, per event. → `/owner?tab=reconciliation`
- Dietary & accessibility — guest needs aggregated across every event. → `/owner?tab=guestneeds`
- Analytics — traffic, funnel, date ranges. → `/owner-analytics`
- Messaging log — email/SMS delivery history. → `/owner?tab=messaging`
- Error monitoring — app error log. → `/owner?tab=errors`
- Recent updates — latest changes across events. → `/owner?tab=reports`

**Per event (pick an event, then drill in)**
- Guest data report — full matrix: attendance, headcounts, shirt sizes, dietary, accessibility, payments, plus CSV and "email this report". Opens the existing `EventReportDialog` for the selected event.
- Attendance CSV — RSVP status and headcounts.
- Shirt order CSV — size tally for the printer.
- Event summary PDF — the printable one-pager.

The per-event block gets a small event picker (search + recent events) at the top, so choosing an event then a report is two taps. Owners see all events; admins see all events; hosts never reach this route.

**Not moved:** every report stays exactly where it is today. The event's own Reports tab keeps the shirt tally and CSVs for hosts; owner tabs keep working and remain deep-linkable. The hub only adds a front door.

## 4. Technical notes

- `src/routes/_authenticated/reports.tsx`, `createFileRoute("/_authenticated/reports")`, own `head()` metadata.
- Access check reuses `meIsAdmin` / `meIsOwner` from `src/lib/pricing.functions`, same pattern as `/admin`; owner-only entries are hidden from plain admins.
- Definitions live in one array (`REPORTS`) so the hub, and any future launcher, stay in sync — no second hand-maintained list.
- Event picker reuses the existing owner event search rather than a new server function; per-event reports reuse `EventReportDialog`, `buildGuestReport`, and the existing CSV/PDF exporters.
- Mobile: single-column cards, 44px minimum targets, no horizontal scroll.
- URL-backed state: selected event and open dialog reflected in search params so a refresh does not drop you back to the top.
