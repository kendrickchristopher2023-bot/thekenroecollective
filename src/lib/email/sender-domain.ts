/**
 * Single source of truth for email sender identity.
 *
 * SENDER_DOMAIN must exactly match the domain attached to this project in
 * Cloud -> Emails. It is the domain that signs the message (DKIM) and owns the
 * return path. FROM_DOMAIN is what recipients see in the From: header.
 *
 * These two MUST stay on the same root domain. When they disagree, strict
 * providers (Apple/iCloud in particular) accept the message from the relay and
 * then silently discard it — the send log says "sent" but nothing ever arrives.
 */
export const SITE_NAME = "The Kenroe Collective";
export const SENDER_DOMAIN = "notify.thekenroecollective.com";
export const FROM_DOMAIN = "thekenroecollective.com";
export const ROOT_DOMAIN = "thekenroecollective.com";

/** Ready-to-use From: header value. */
export const FROM_ADDRESS = `${SITE_NAME} <noreply@${FROM_DOMAIN}>`;
