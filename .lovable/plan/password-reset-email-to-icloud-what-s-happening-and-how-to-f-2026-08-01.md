# Password reset email to iCloud — what's happening and how to fix it

## What I verified

- Your reset request did go through. The auth log shows `user_recovery_requested` for `kendrickchristopher@icloud.com` at 06:31 UTC, and the email log shows the `recovery` email queued and then accepted for delivery at 06:31:35. Nothing is broken in the app code, the queue, or the reset page.
- The address is **not** on the suppression list, so it isn't being blocked on our side.
- The real problem is a sender-identity mismatch. The project's configured sending domain is the **kenroes.com** subdomain (`notify.www.kenroes.com`), but the app stamps every email as coming from **thekenroecollective.com**. So the signing/return-path domain and the visible From domain don't match.
- Both `notify.www.kenroes.com` and `notify.thekenroecollective.com` are verified, but only the kenroes one is attached to this project as the sender.

Apple/iCloud is one of the strictest providers about that mismatch: it accepts the message from the relay and then silently discards it instead of putting it in Junk. That matches exactly what you saw — "sent" on our side, nothing in your inbox or spam.

This is the same underlying issue as Christopher's missing signup email earlier, so fixing it fixes both.

## The fix

1. Attach `notify.thekenroecollective.com` to this project as the sender domain (one click in the email setup dialog — I'll surface it). This is the piece I cannot do for you.
2. Once attached, align every send path so the signing domain and the visible From domain are the same brand:
   - auth emails (confirm, reset, magic link, invite, email change, reauthentication)
   - app emails sent from the server (thank-yous, reminders, contact tickets, security notices)
3. Re-send the password reset to `kendrickchristopher@icloud.com` and confirm the log shows an accepted send on the aligned domain.
4. Verify a second delivery to a non-Apple inbox so we know the change didn't regress anything.

## Other things you should be aware of

- **Two emails were permanently dead-lettered** and are never retried automatically. They were to `demo@thekenroecollective.com` and test/example addresses, so no real user was affected — but worth knowing that dead-lettered mail needs a manual re-trigger.
- **`demo@thekenroecollective.com` hard-bounced** and is now suppressed. If that mailbox doesn't actually exist, the demo account's security notices will keep failing. We should either create the mailbox or stop sending to it.
- **You have two branded sending subdomains delegated to Lovable** (`notify.www.kenroes.com` and `notify.thekenroecollective.com`). Once we standardize on the Kenroe Collective one, the kenroes.com delegation is dead weight — you can leave it or remove the NS records at your registrar later.
- **MFA reminder:** your iCloud account is a super admin, so after the password reset you'll be required to enroll an authenticator app before `/owner` will load.

## Technical detail

`SENDER_DOMAIN` / `FROM_DOMAIN` are hardcoded constants in `src/routes/lovable/email/auth/webhook.ts` and `src/lib/email/server-enqueue.server.ts` (and the transactional send route). They currently name `thekenroecollective.com` while the project-level sender is `notify.www.kenroes.com`. After the domain is attached, these stay on the Kenroe Collective domain and the project config matches them, giving proper SPF/DKIM alignment.
