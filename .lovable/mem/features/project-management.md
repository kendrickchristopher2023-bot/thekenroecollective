---
name: Project Management
description: Standalone PM system with Kanban, tasks, comments, attachments, role-based sharing, and tier access rules
type: feature
---
Project Management access rules:

- **Project Management requires the PM add-on for all tiers including Atelier.** No tier includes PM by default. Purchase via `pm_addon_monthly` ($5/mo) or `pm_addon_yearly` ($48/yr).
- Seat limits when the PM add-on is active: Postcard = 3, Whisper = 3, Host = 5, Atelier = 20. Seats include the project owner + accepted members + outstanding invites.
- Without the add-on: 0 seats, no PM access, for every tier (owner-role internal accounts exempted).
- **Postcard and Whisper + PM add-on** get **standalone** Project Management only — they cannot link projects to events.
- **Host and Atelier + PM add-on** get Project Management with **full event integration** — projects can be attached to events and cross-linked.
- Gating logic:
  - `hasPmAddon === false` (and not owner-role) → show `LockedStep` with the PM add-on purchase CTA. Atelier users see the same CTA as everyone else — no "included" messaging.
  - `hasPmAddon === true` → show Project Management UI.
  - Event integration ("Link to event") is gated separately by tier: only Host and Atelier tiers can link, regardless of add-on. Postcard/Whisper PM users see an upgrade message.
- Keep all Project Management navigation client-side via TanStack Link/useNavigate; no hard reloads or state-wiping redirects.
