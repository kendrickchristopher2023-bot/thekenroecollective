import { createHmac, timingSafeEqual } from "crypto";

/**
 * Validate Twilio's X-Twilio-Signature header for form-encoded webhooks.
 *
 * Twilio's canonical string is: the exact URL Twilio POSTed to, followed by
 * the concatenation of every POST parameter (sorted alphabetically by key)
 * with each key immediately followed by its value. HMAC-SHA1 with the
 * account's auth token, base64-encoded.
 *
 * Docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validateTwilioFormSignature(opts: {
  authToken: string;
  signatureHeader: string | null;
  url: string;
  params: URLSearchParams;
}): boolean {
  const { authToken, signatureHeader, url, params } = opts;
  if (!authToken || !signatureHeader) return false;

  const keys: string[] = [];
  params.forEach((_v, k) => {
    if (!keys.includes(k)) keys.push(k);
  });
  keys.sort();

  let data = url;
  for (const k of keys) {
    const values = params.getAll(k);
    for (const v of values) data += k + v;
  }

  const expected = createHmac("sha1", authToken).update(data).digest("base64");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
