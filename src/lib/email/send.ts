import { sendTransactionalEmailFn } from '@/lib/email.functions'

export interface SendTransactionalEmailArgs {
  templateName: string
  recipientEmail: string
  idempotencyKey: string
  templateData?: Record<string, unknown>
  eventId?: string
}

/**
 * Sends a single transactional email via the Lovable email queue.
 *
 * Routes through a server function so the demo environment can be blocked
 * server-side (see src/lib/email.functions.ts). Never POST to
 * /lovable/email/transactional/send from the browser — that path has no
 * demo guard and the demo account holds a real Supabase session.
 */
export async function sendTransactionalEmail(args: SendTransactionalEmailArgs) {
  return sendTransactionalEmailFn({ data: args })
}
