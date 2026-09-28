# Super admin: ban and delete users

Already implemented (live now, no review needed):
- New `super_admin` role added to the role list; granted to Christopher's account only.
- New `admin_audit_log` table (actor, action, target, details, timestamp). Readable by super admins only; not editable or deletable by anyone.
- Role granting is now closed off: only a super admin can grant/revoke `owner` or `admin`, through a secure database function that re-checks the role server-side and writes an audit entry. Refuses to remove the last super admin or a super admin's own super_admin role.
- Owner console Users tab shows "make owner / revoke owner / make admin / revoke admin" buttons **only** to a super admin. A plain owner (Adrian) sees the tier controls and invite flow only — the existing create-user/tier feature never granted roles, so there was no pre-existing gap.

What follows is the part awaiting approval.

## 1. Ban (primary action)

- Server function `banUserAsSuperAdmin`, gated on `has_role(auth.uid(), 'super_admin')`.
- Uses `auth.admin.updateUserById(id, { ban_duration })`, presets: 24h, 7d, 30d, permanent (`876000h`). Unban = `ban_duration: 'none'`.
- Effect: user cannot sign in, existing sessions are revoked. No data touched, fully reversible.
- Banned state surfaces as a red "banned until …" badge in the Users tab, with an Unban button.
- Every ban/unban writes an audit entry.

## 2. Delete — recommended model: soft-delete + anonymize, with a pre-flight blocker

Reason: the real foreign keys make a hard delete destructive to *other* people's data.

What a hard `auth.admin.deleteUser` would cascade away today:

```text
CASCADE (rows vanish):
  vendors            -> and with them: vendor_reviews written by OTHER users,
                        rfq_invitations, rfq_messages tied to that vendor
  rfq_requests       -> plus every rfq_message in the thread, including vendors' bids
  pm_projects        -> shared projects, tasks, comments, attachments of collaborators
  contacts, contact_groups, carts, design_assets, ai_packages,
  one_time_passes, subscriptions, refund_log, sms_outbox, support_messages,
  trial_claims, user_known_devices, profiles, user_roles
SET NULL (rows survive, ownerless):
  events.user_id     -> event stays public with no owner, still reachable by share link
  support_tickets, purchase_consent_log, referrals.referred_user_id,
  pm_tasks.assignee/created_by, announcements.created_by, ad_placements
```

So the deletion flow becomes three steps:

1. **Pre-flight report.** Server function counts the user's live footprint: active events (not archived), vendor profiles, open RFQ threads, PM projects with other members, active subscriptions/passes.
2. **Block on hard blockers.** Deletion is refused while the user still has: a vendor profile with reviews or RFQ history, an open (not closed) RFQ thread, a PM project with other members, or an active paid subscription. The panel explains exactly what to resolve (archive the events, close the RFQ, transfer the project, cancel the subscription) — no silent data loss.
3. **Anonymize instead of dropping rows.** When clear:
   - archive all their events (`archived_at = now()`), so nothing stays publicly live and ownerless;
   - blank the profile (display_name -> "Deleted user", null avatar/phone), delete their contacts and CRM rows (their own personal data);
   - permanently ban the auth user and mark `profiles.deletion_requested_at`, which the existing 30-day `hard-delete-accounts` cron already turns into a real `auth.admin.deleteUser` — so the actual auth-record removal reuses the pipeline that exists, with a 30-day reversal window.
   - a "Delete now (irreversible)" escape hatch stays available to super admin only, for spam/abuse accounts with no footprint (pre-flight count of zero).

## 3. Safety rails (all paths)

- Confirmation requires typing the target's exact email; the button stays disabled until it matches.
- Never on your own account; never on the last remaining super admin or the last owner.
- Every action writes `admin_audit_log` (actor id + email, action, target id + email, details).
- New "Audit log" view inside the Users tab, super admin only.

## Technical notes

- New file `src/lib/super-admin.functions.ts`: `banUserAsSuperAdmin`, `unbanUserAsSuperAdmin`, `getUserDeletionPreflight`, `softDeleteUserAsSuperAdmin`, `hardDeleteUserAsSuperAdmin`, `listAuditLog`. Each re-checks `super_admin` via `context.supabase.rpc('has_role', ...)` before touching the admin client.
- UI lives in the existing Users tab (`src/components/admin/owner-users-panel.tsx`), inside an `isSuperAdmin` block — no new route.
- `listUsersAsOwner` extended to return `banned_until` so the badge is real state, not optimistic.
