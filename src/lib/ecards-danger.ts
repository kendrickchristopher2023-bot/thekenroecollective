// Group eCards — shared confirmation for deleting a card.
// Deleting is permanent and cascades to that card's messages, so a paid card
// or a card with messages asks for a deliberate typed confirmation.
import { confirmDialog, promptDialog } from "@/lib/confirm-dialog";

export type EcardDeleteContext = {
  occasion: string;
  recipientName: string;
  paid: boolean;
  messageCount: number;
};

export function describeEcardLoss(ctx: EcardDeleteContext): string {
  const messages = `${ctx.messageCount} ${ctx.messageCount === 1 ? "message" : "messages"}`;
  if (ctx.paid && ctx.messageCount > 0) {
    return `This card is paid and has ${messages}. Deleting permanently removes the card and every message, and does not refund the payment. This cannot be undone.`;
  }
  if (ctx.paid) {
    return "This card is paid. Deleting permanently removes it and does not refund the payment. This cannot be undone.";
  }
  if (ctx.messageCount > 0) {
    return `This card has ${messages}. Deleting permanently removes the card and every message on it. This cannot be undone.`;
  }
  return "This removes the card for good. This cannot be undone.";
}

/** Returns true only when the organizer confirms the deletion. */
export async function confirmEcardDelete(ctx: EcardDeleteContext): Promise<boolean> {
  const title = `Delete "${ctx.occasion} for ${ctx.recipientName}"?`;
  const serious = ctx.paid || ctx.messageCount > 0;

  const ok = await confirmDialog({
    title,
    body: describeEcardLoss(ctx),
    confirmLabel: serious ? "Continue to delete" : "Yes, delete this card",
    cancelLabel: "Keep this card",
    tone: "danger",
  });
  if (!ok) return false;
  if (!serious) return true;

  const typed = await promptDialog({
    title: "Type DELETE to confirm",
    body: "This is permanent, so we ask you to type the word DELETE in capitals.",
    placeholder: "DELETE",
    confirmLabel: "Delete permanently",
    cancelLabel: "Keep this card",
  });
  return typed === "DELETE";
}
