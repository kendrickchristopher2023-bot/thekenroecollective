# Owner console — Users tab improvements

## 1. Escapable ban / delete panels

Today the ban and delete panels open inline in the row and can only be closed by clicking the same
Ban/Delete pill again — there is no visible way out, and Escape does nothing.

- Add a clear **Cancel** button (and an X in the panel corner) to both the ban and the delete panel.
- Escape key closes the open panel and clears the typed confirmation.
- Cancel/close always resets the typed email, the ban duration, and the fetched footprint, so
  reopening starts clean.
- While an action is running, the panel stays open and disabled (no accidental close mid-request).

## 2. Edit a user's profile and email

New inline **Edit** panel per row (super-admin only, same gating as ban/delete) with:

- Display name — writes to the profile.
- Email address — changes the sign-in email. Two modes offered:
  - *Send confirmation* (default, safest): the user must confirm the new address by email.
  - *Change immediately* (marks the address confirmed) — requires typing the current email to confirm.
- Phone number and tier stay where they are (tier already has its own control).
- Optional actions in the same panel:
  - **Send password reset** email.
  - **Resend invitation** for accounts still showing "invite pending".
  - **Confirm email manually** for accounts stuck unconfirmed.

Every one of these writes an entry to the existing admin audit log, including the old and new value
for email/name changes, so the trail matches ban/delete.

Guardrails: you cannot change your own email through this panel (use Profile), and email changes are
blocked in demo mode like the other privileged actions.

## 3. Other recommendations for this screen

Included in this pass:

- **Row overflow menu.** Tier select, edit, ban, delete and role toggles all crowd the right-hand
  cell. Collapse the privileged actions behind a single "Manage" menu per row, keeping the tier
  select visible.
- **Last sign-in column.** The data is already returned by the server but never displayed — useful
  for spotting dormant or never-logged-in accounts.
- **Role badges as one control.** Instead of separate "make owner"/"revoke owner" pills, show current
  roles with a small toggle group; super_admin remains display-only (granted only by database, never
  from the UI).
- **Filter chips.** Quick filters for: banned, invite pending, owners/admins, paying (has active
  subscription), free.
- **Result count and totals.** "Showing X of Y users" plus a small breakdown by tier at the top.
- **Copy user id / email** button, since ids are needed for support lookups.
- **Sortable Joined / Last sign-in** headers.

Not included (call it out, don't build): CSV export of the user list, and bulk actions across
multiple selected users — both are easy to add later but widen the blast radius of a mis-click.

## Technical notes

- New server functions in `src/lib/super-admin.functions.ts`: `updateUserProfileAsSuperAdmin`
  (display name), `changeUserEmailAsSuperAdmin`, `sendPasswordResetAsSuperAdmin`,
  `resendInviteAsSuperAdmin`, `confirmUserEmailAsSuperAdmin`. All re-verify `super_admin` via the
  same guard used by ban/delete, call `assertNotDemo`, and insert into `admin_audit_log`.
- Email/name mutations go through the admin auth API plus a `profiles` update; no schema changes and
  no new tables are required.
- UI changes are confined to `src/components/admin/owner-users-panel.tsx` and
  `src/components/admin/super-admin-user-actions.tsx` (plus one new edit-panel component to keep the
  files readable). `listUsersAsOwner` already returns `last_sign_in_at`, so the new column needs no
  backend change.
- Verification: run the Users tab in the preview and confirm each panel opens, closes via Cancel and
  Escape, an email change round-trips in the list after refresh, and the audit log shows the new
  action rows.
