// Client-safe helpers for the Postcard free-tier lockdown. Wraps
// useEntitlements so every UI surface reads the same tier flags. Server
// gates live in src/lib/tier-guards.server.ts.

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getEntitlements, type Tier } from "@/lib/entitlements-client";
import { onPreviewTierChange } from "@/lib/preview-tier";

export type FeatureKey =
  | "sms_reminders"
  | "announcements_email_sms"
  | "ai"
  | "photo_wall"
  | "seating_chart"
  | "exports"
  | "vendor_rfq"
  | "checkin"
  | "multiple_events";

export const POSTCARD_UPGRADE_COPY: Record<
  FeatureKey,
  { title: string; description: string; target: "whisper" | "host" | "atelier" }
> = {
  sms_reminders: {
    title: "SMS reminders",
    description:
      "Text your guests day-of reminders and RSVP nudges. Included free on Host and Atelier, or add the $6 SMS pack to your current plan.",
    target: "host",
  },
  announcements_email_sms: {
    title: "Email & SMS announcements",
    description: "Broadcast venue changes and updates by email and SMS with Whisper.",
    target: "whisper",
  },
  ai: {
    title: "AI-powered design & copy",
    description: "AI Polish, invite drafts, design studio, and package generation are part of Atelier.",
    target: "atelier",
  },
  photo_wall: {
    title: "Live photo wall",
    description: "Guests upload from their phones and photos appear on-screen in real time — included in Host & Atelier, or add it to any event for $9.",
    target: "host",
  },
  seating_chart: {
    title: "Seating charts",
    description: "Drag-and-drop tables, assign guests, and print seating cards — part of the Atelier day-of toolkit.",
    target: "atelier",
  },
  exports: {
    title: "Export invitations & guest lists",
    description: "PDF, Word, CSV, and calendar exports are included with Whisper.",
    target: "whisper",
  },
  vendor_rfq: {
    title: "Vendor RFQ",
    description: "Send request-for-quote to vetted vendors and compare bids — included with Whisper.",
    target: "whisper",
  },
  checkin: {
    title: "Guest check-in",
    description: "QR-code check-in at the door and live attendance tracking — part of the Atelier day-of toolkit.",
    target: "atelier",
  },
  multiple_events: {
    title: "Host more than one event",
    description: "Whisper unlocks unlimited events on your account.",
    target: "whisper",
  },
};

export function useIsPostcard(): {
  isPostcard: boolean;
  tier: Tier | null;
  loading: boolean;
} {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["entitlements", "for-gates"],
    queryFn: getEntitlements,
    staleTime: 60_000,
  });
  useEffect(
    () => onPreviewTierChange(() => queryClient.invalidateQueries({ queryKey: ["entitlements", "for-gates"] })),
    [queryClient],
  );
  if (!data) return { isPostcard: false, tier: null, loading: isLoading };
  // Owners always pass all gates; only lock down when the effective tier is
  // postcard (this includes owners previewing as postcard).
  return { isPostcard: data.tier === "postcard", tier: data.tier, loading: false };
}

/**
 * Inspect a thrown error/response for the server-side upgrade_required
 * envelope. Returns the required tier or null. Both shapes are supported:
 *  - Response with JSON body { code, requiredTier }
 *  - Error with .message containing "upgrade_required" and a `requiredTier`
 *    property (added by our server helpers).
 */
export function parseUpgradeRequired(err: unknown):
  | { code: "upgrade_required"; requiredTier: "whisper" | "host" | "atelier" }
  | null {
  if (!err) return null;
  const anyErr = err as any;
  const code = anyErr?.code ?? anyErr?.body?.code;
  const req = anyErr?.requiredTier ?? anyErr?.body?.requiredTier;
  if (code === "upgrade_required" && (req === "whisper" || req === "host" || req === "atelier")) {
    return { code, requiredTier: req };
  }
  const msg = String(anyErr?.message ?? "");
  if (msg.includes("upgrade_required")) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed?.code === "upgrade_required" && parsed?.requiredTier) {
        return { code: "upgrade_required", requiredTier: parsed.requiredTier };
      }
    } catch {
      // fall through
    }
  }
  return null;
}
