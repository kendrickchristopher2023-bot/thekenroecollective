/**
 * Host alert preferences for join requests ("ask the host to add me").
 *
 * A missed request has a real person waiting on the other end, so email and the
 * in-app bell are ON by default and hosts opt out rather than opt in. SMS is the
 * only channel that stays off until asked for, since it costs money and carries
 * the existing Host+/SMS-pack gate.
 */
export interface JoinRequestPrefs {
  join_requests_email: boolean;
  join_requests_inapp: boolean;
  join_requests_sms: boolean;
}

export const JOIN_REQUEST_PREF_DEFAULTS: JoinRequestPrefs = {
  join_requests_email: true,
  join_requests_inapp: true,
  join_requests_sms: false,
};

/** Read the three join-request switches out of a profile's notification_prefs. */
export function joinRequestPrefs(prefs: unknown): JoinRequestPrefs {
  const p = (prefs ?? {}) as Record<string, unknown>;
  const pick = (key: keyof JoinRequestPrefs) =>
    typeof p[key] === "boolean" ? (p[key] as boolean) : JOIN_REQUEST_PREF_DEFAULTS[key];
  return {
    join_requests_email: pick("join_requests_email"),
    join_requests_inapp: pick("join_requests_inapp"),
    join_requests_sms: pick("join_requests_sms"),
  };
}
