export interface AdminEmailPayload {
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

/**
 * Sends an "admin notification" email to the fixed admin recipient defined
 * in the admin-notification template. Server-side only.
 *
 * Failures are logged and swallowed so the calling flow is never broken.
 */
export async function notifyAdminsByEmail(payload: AdminEmailPayload): Promise<void> {
  try {
    const { enqueueTransactionalEmailServer } = await import("@/lib/email/server-enqueue.server");
    await enqueueTransactionalEmailServer({
      templateName: "admin-notification",
      recipientEmail: "support@thekenroecollective.com",
      idempotencyKey: `admin-${payload.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      templateData: payload as unknown as Record<string, unknown>,
    });
  } catch (err) {
    console.error("notifyAdminsByEmail failed", err);
  }
}
