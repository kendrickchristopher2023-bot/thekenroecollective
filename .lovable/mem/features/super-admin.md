---
name: Super admin role
description: super_admin role (Christopher's 3 accounts) gates ban/delete users and granting the owner/admin roles; admin_audit_log records every action
type: feature
---

`app_role` enum includes `super_admin`, granted only to Christopher's accounts:
`kendrickchristopher@hotmail.com` (`97f3faca-8a1b-4067-9792-5fa82c00707a`, primary),
`kendrickchristopher@icloud.com` (`ab8a9e05-b14f-41ca-b0e4-e5822a2e98f2`, backup),
`chris@thekenroecollective.com` (`06d7554f-1013-4a80-a91e-a36c252017d9`, brand-domain backup).
Adrian holds owner+admin on `adrianmonroe@comcast.net` only. `adrian@thekenroecollective.com`
and `kendrickchristopher2023@gmail.com` were deliberately stripped to plain `user` — do not
re-grant them privileged roles without being asked.


Rules:
- Ban, delete, and role granting/revoking gate on `has_role(auth.uid(), 'super_admin')` — never on `owner`. Plain owners (Adrian) keep analytics, announcements, invites, and tier changes but must never see these controls.
- Only super admin can grant/revoke `owner` or `admin`, via the `super_admin_set_role` SECURITY DEFINER function. It refuses to remove the last super_admin or a super admin's own super_admin role.
- Ban is the default action: `auth.admin.updateUserById` with `ban_duration` (24h/7d/30d/permanent `876000h`), reversible with `'none'`.
- Delete defaults to reversible soft delete: archive events, anonymize profile, delete contacts, permanent ban, set `profiles.deletion_requested_at` so the existing 30-day `hard-delete-accounts` cron performs the real removal. Hard delete is only offered when the account has zero events/vendor/RFQ/project/billing footprint.
- Deletion is blocked while the user has vendor reviews from others, open RFQ threads, projects shared with other members, or an active subscription — never silently erase other users' data.
- Every action requires typing the target's exact email, blocks self-targeting and the last super_admin/owner, and writes to `admin_audit_log` (super-admin-read-only, no updates/deletes).

Code: `src/lib/super-admin.functions.ts`, `src/components/admin/super-admin-user-actions.tsx`, surfaced in the Users tab of `/owner`.
