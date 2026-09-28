/**
 * Owner alert contact details, in ONE place.
 *
 * To change who receives owner alerts later, edit only this file:
 *  - OWNER_ALERT_PHONE  : the phone number that receives payment texts
 *  - OWNER_ALERT_EMAILS : every address that receives owner alert emails
 *
 * Nothing else needs to change. Every alert path reads these constants.
 */

/** Internal admin SMS destination, E.164 format. */
export const OWNER_ALERT_PHONE = "+14043580626";

/** Every owner address that receives alert emails. */
export const OWNER_ALERT_EMAILS = [
  "kendrickchristopher@hotmail.com",
  "support@thekenroecollective.com",
];

/** Where alert emails link to. */
export const OWNER_ALERT_DASHBOARD_URL = "https://thekenroecollective.com/owner";

/** Prefix on owner SMS alerts so they are obviously internal. */
export const OWNER_ALERT_SMS_PREFIX = "Kenroe";
