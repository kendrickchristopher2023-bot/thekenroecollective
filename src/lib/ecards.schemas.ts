// Group eCards — input schemas + shared row types. Kept out of the
// *.functions.ts module so server-function splitting cannot strand them.
import { z } from "zod";

export const MediaTypeEnum = z.enum(["none", "gif", "image", "video", "audio"]);

export const CreateEcardInput = z.object({
  occasion: z.string().min(1).max(80),
  recipientName: z.string().min(1).max(120),
  recipientEmail: z.string().trim().email().max(320).optional().nullable(),
  theme: z.string().min(1).max(40),
  revealDate: z.string().min(4).max(64),
  // Creator's device time zone, display only, used to label reveal times in emails.
  timezone: z.string().min(1).max(64).optional(),
});

export const UpdateEcardInput = z.object({
  id: z.string().uuid(),
  occasion: z.string().min(1).max(80).optional(),
  recipientName: z.string().min(1).max(120).optional(),
  recipientEmail: z.union([z.string().trim().email().max(320), z.literal("")]).optional().nullable(),
  theme: z.string().min(1).max(40).optional(),
  revealDate: z.string().min(4).max(64).optional(),
  // Organizer's zone, used only as a fallback if a naive wall clock arrives.
  timezone: z.string().min(1).max(64).optional(),
  status: z.enum(["draft", "collecting", "revealed"]).optional(),
});

export const ContributionActionInput = z.object({
  contributionId: z.string().uuid(),
  hidden: z.boolean().optional(),
});

export const ReorderInput = z.object({
  ecardId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1).max(500),
});

export const SubmitContributionInput = z.object({
  slug: z.string().min(6).max(64),
  contributorName: z.string().min(1).max(80),
  message: z.string().max(2000).default(""),
  mediaType: MediaTypeEnum.default("none"),
  mediaUrl: z.string().max(1000).optional().nullable(),
  gifUrl: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  videoUrl: z.string().max(1000).optional().nullable(),
  audioUrl: z.string().max(1000).optional().nullable(),
});

/** Organizer writing their own message straight into their card. */
export const OrganizerContributionInput = z.object({
  ecardId: z.string().uuid(),
  contributorName: z.string().min(1).max(80),
  message: z.string().max(2000).default(""),
  mediaType: MediaTypeEnum.default("none"),
  mediaUrl: z.string().max(1000).optional().nullable(),
  gifUrl: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  videoUrl: z.string().max(1000).optional().nullable(),
  audioUrl: z.string().max(1000).optional().nullable(),
});

/** Organizer correcting any message on a card they own, before the reveal. */
export const EditContributionAsOrganizerInput = z.object({
  contributionId: z.string().uuid(),
  contributorName: z.string().min(1).max(80),
  message: z.string().max(2000).default(""),
  mediaType: MediaTypeEnum.default("none"),
  mediaUrl: z.string().max(1000).optional().nullable(),
  gifUrl: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  videoUrl: z.string().max(1000).optional().nullable(),
  audioUrl: z.string().max(1000).optional().nullable(),
});

export const EditTokenInput = z.object({ token: z.string().min(10).max(120) });

/** One of the four independent attachment slots on a message. */
export const MediaSlotEnum = z.enum(["gif", "image", "video", "audio"]);

export const RemoveContributionMediaInput = z.object({
  contributionId: z.string().uuid(),
  slot: MediaSlotEnum,
});

export const RemoveMediaByTokenInput = z.object({
  token: z.string().min(10).max(120),
  slot: MediaSlotEnum,
});


export const UpdateByTokenInput = z.object({
  token: z.string().min(10).max(120),
  message: z.string().max(2000).default(""),
  mediaType: MediaTypeEnum.default("none"),
  mediaUrl: z.string().max(1000).optional().nullable(),
  gifUrl: z.string().max(1000).optional().nullable(),
  imageUrl: z.string().max(1000).optional().nullable(),
  videoUrl: z.string().max(1000).optional().nullable(),
  audioUrl: z.string().max(1000).optional().nullable(),
});

export const EcardCheckoutInput = z.object({
  ecardId: z.string().uuid(),
  returnUrl: z.string().min(4).max(2000),
  environment: z.enum(["sandbox", "live"]),
  /**
   * Add a Kenroe Sound Studio piece of this length to the same payment. The
   * piece is composed after payment clears, then attached to the card.
   */
  musicSeconds: z.number().int().min(31).max(240).optional(),
});

export const EcardConfirmInput = z.object({
  sessionId: z.string().min(4).max(500),
  environment: z.enum(["sandbox", "live"]),
});

export const SlugInput = z.object({ slug: z.string().min(6).max(64) });

export const DraftMessageInput = z.object({
  slug: z.string().min(6).max(64),
  hint: z.string().max(400).default(""),
  contributorName: z.string().max(80).default(""),
});


export type EcardMediaType = "none" | "gif" | "image" | "video" | "audio";

export type EcardRow = {
  id: string;
  organizer_user_id: string;
  occasion: string;
  recipient_name: string;
  recipient_email: string | null;
  theme: string;
  reveal_date: string;
  status: "draft" | "collecting" | "revealed";
  public_slug: string;
  created_at: string;
  is_paid: boolean;
  paid_at: string | null;
  delivered_at: string | null;
  /** Organizer's browser zone, used to hold reminder emails to their daytime. */
  organizer_timezone?: string | null;
};

export type ContributionRow = {
  id: string;
  ecard_id: string;
  contributor_name: string;
  message: string;
  media_type: EcardMediaType;
  media_url: string | null;
  gif_url: string | null;
  image_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  is_hidden: boolean;
  position: number;
  created_at: string;
};

export type PublicEcard = {
  occasion: string;
  recipient_name: string;
  theme: string;
  reveal_date: string;
  status: string;
  public_slug: string;
  contribution_count: number;
  revealed: boolean;
};

/** A contributor's own message, fetched with their private edit token. */
export type MyContribution = {
  id: string;
  contributor_name: string;
  message: string;
  media_type: EcardMediaType;
  media_url: string | null;
  gif_url: string | null;
  image_url: string | null;
  video_url: string | null;
  audio_url: string | null;
  occasion: string;
  recipient_name: string;
  theme: string;
  reveal_date: string;
  public_slug: string;
  locked: boolean;
};

export type RevealPayload = {
  occasion: string;
  recipient_name: string;
  theme: string;
  reveal_date: string;
  revealed: true;
  contributions: Array<{
    id: string;
    contributor_name: string;
    message: string;
    media_type: EcardMediaType;
    media_url: string | null;
    gif_url: string | null;
    image_url?: string | null;
    video_url?: string | null;
    audio_url?: string | null;
  }>;

};
