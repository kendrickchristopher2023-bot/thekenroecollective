// Group eCards — the single place the send fee is defined.
// Change the amount here and in Stripe (same lookup key) to change the price.

/** Stripe price lookup key for the one-off card delivery fee. */
export const ECARD_SEND_PRICE_ID = "ecard_send_fee";

/** Amount in cents. Keep in step with the Stripe price on ECARD_SEND_PRICE_ID. */
export const ECARD_SEND_PRICE_CENTS = 399;

export const ECARD_SEND_CURRENCY = "USD";

/** Display label, e.g. "$3.99". */
export const ECARD_SEND_PRICE_LABEL = `$${(ECARD_SEND_PRICE_CENTS / 100).toFixed(2)}`;
