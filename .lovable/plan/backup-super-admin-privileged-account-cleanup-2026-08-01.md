# Backup super admin + privileged account cleanup

## What I confirmed

Current roles (live check):

| Account | Roles | 2FA enrolled |
| --- | --- | --- |
| kendrickchristopher@hotmail.com | admin, owner, **super_admin** | No |
| kendrickchristopher@icloud.com | admin, owner | No |
| chris@thekenroecollective.com | admin, owner | Yes |
| kendrickchristopher2023@gmail.com | admin, owner | No |
| adrianmonroe@comcast.net | admin, owner | Yes-no (signed in, no 2FA) |
| adrian@thekenroecollective.com | admin, owner | Never signed in / unconfirmed |

Today there is exactly **one** super admin, so losing the hotmail mailbox would leave nobody able to ban/delete users or grant owner/admin again.

## Changes (all data changes to the roles table — no code or schema change)

1. **Grant `super_admin` to kendrickchristopher@icloud.com** — the requested backup.
2. **Grant `super_admin` to chris@thekenroecollective.com** — the only account with two-factor already enrolled and the one on the brand domain, so there's a recovery path you can actually get into during an incident.
3. **Revoke owner + admin from adrian@thekenroecollective.com** — never signed in, unconfirmed; Adrian's working owner access stays on adrianmonroe@comcast.net.
4. **Revoke owner + admin from kendrickchristopher2023@gmail.com** — unused since June, drops one unnecessary privileged account. It keeps the plain user role, so nothing about the account breaks and access can be handed back any time.

Result: three super admins (hotmail, icloud, chris@), two other owners (your gmail-free set plus Adrian's comcast account), and two fewer privileged accounts overall.

## What you need to do yourself

**Enroll two-factor on the hotmail and icloud accounts.** Two-factor is mandatory for the owner console, so a super admin without it gets stopped at the enrollment gate the moment it opens `/owner` — including during an emergency. I can't enroll an authenticator on your behalf; sign in on each account, open `/owner`, and complete the prompt. Same for Adrian's comcast account when convenient.

## Technical notes

- Role rows are added/removed in `public.user_roles` (conflict-safe insert, targeted delete by user id + role).
- Existing rails are unaffected: the system still refuses to remove the last super admin or a super admin's own super_admin role, and every privileged action either new super admin takes is written to the audit log with actor email.
- Nothing in `src/` changes — the owner console, role controls, and audit log already support multiple super admins.
