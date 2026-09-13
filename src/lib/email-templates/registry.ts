import type { ComponentType } from "react";

export interface TemplateEntry {
  component: ComponentType<any>;
  subject: string | ((data: Record<string, any>) => string);
  displayName?: string;
  previewData?: Record<string, any>;
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string;
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as thankYouCardTemplate } from "./thank-you-card";
import { template as adminNotificationTemplate } from "./admin-notification";
import { template as vendorRfqInviteTemplate } from "./vendor-rfq-invite";
import { template as rfqNewBidTemplate } from "./rfq-new-bid";
import { template as rfqPositionFilledTemplate } from "./rfq-position-filled";
import { template as eventInviteTemplate } from "./event-invite";
import { template as rsvpReminderTemplate } from "./rsvp-reminder";
import { template as paymentReminderTemplate } from "./payment-reminder";
import { template as paymentRequestTemplate } from "./payment-request";
import { template as securityNewDeviceTemplate } from "./security-new-device";
import { template as contactBroadcastTemplate } from "./contact-broadcast";
import { template as pmInviteTemplate } from "./pm-invite";
import { template as guestPrivacyVerifyTemplate } from "./guest-privacy-verify";
import { template as guestPrivacyDeletedTemplate } from "./guest-privacy-deleted";
import { template as guestPrivacyHostNoticeTemplate } from "./guest-privacy-host-notice";
import { template as ecardDeliveryTemplate } from "./ecard-delivery";
import { template as ecardDeliveredTemplate } from "./ecard-delivered";
import { template as ecardReminderTemplate } from "./ecard-reminder";
import { template as ownerAlertTemplate } from "./owner-alert";
import { template as wellWishesDigestTemplate } from "./well-wishes-digest";
import { template as reportDeliveryTemplate } from "./report-delivery";
import { template as bringSheetNudgeTemplate } from "./bring-sheet-nudge";
import { template as eventAnnouncementTemplate } from "./event-announcement";
import { template as guestRequestNoticeTemplate } from "./guest-request-notice";
import { template as guestRequestApprovedTemplate } from "./guest-request-approved";
import { template as waitlistPromotedTemplate } from "./waitlist-promoted";

import { template as guestRequestDeclinedTemplate } from "./guest-request-declined";
import { template as guestRequestReminderTemplate } from "./guest-request-reminder";
import { template as commentDigestTemplate } from "./comment-digest";
import { template as rsvpConfirmationTemplate } from "./rsvp-confirmation";
import { template as eventReminderTemplate } from "./event-reminder";

export const TEMPLATES: Record<string, TemplateEntry> = {
  "thank-you-card": thankYouCardTemplate,
  "admin-notification": adminNotificationTemplate,
  "vendor-rfq-invite": vendorRfqInviteTemplate,
  "rfq-new-bid": rfqNewBidTemplate,
  "rfq-position-filled": rfqPositionFilledTemplate,
  "event-invite": eventInviteTemplate,
  "rsvp-reminder": rsvpReminderTemplate,
  "event-reminder": eventReminderTemplate,
  "payment-reminder": paymentReminderTemplate,
  "payment-request": paymentRequestTemplate,
  "security-new-device": securityNewDeviceTemplate,
  "contact-broadcast": contactBroadcastTemplate,
  "pm-invite": pmInviteTemplate,
  "guest-privacy-verify": guestPrivacyVerifyTemplate,
  "guest-privacy-deleted": guestPrivacyDeletedTemplate,
  "guest-privacy-host-notice": guestPrivacyHostNoticeTemplate,
  "ecard-delivery": ecardDeliveryTemplate,
  "ecard-delivered": ecardDeliveredTemplate,
  "ecard-reminder": ecardReminderTemplate,
  "owner-alert": ownerAlertTemplate,
  "well-wishes-digest": wellWishesDigestTemplate,
  "report-delivery": reportDeliveryTemplate,
  "bring-sheet-nudge": bringSheetNudgeTemplate,
  "event-announcement": eventAnnouncementTemplate,
  "guest-request-notice": guestRequestNoticeTemplate,
  "guest-request-approved": guestRequestApprovedTemplate,
  "waitlist-promoted": waitlistPromotedTemplate,

  "guest-request-declined": guestRequestDeclinedTemplate,
  "guest-request-reminder": guestRequestReminderTemplate,
  "comment-digest": commentDigestTemplate,
  "rsvp-confirmation": rsvpConfirmationTemplate,
};
