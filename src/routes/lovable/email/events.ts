import { createEmailWebhookHandler } from '@lovable.dev/email-js'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'

/**
 * Terminal email outcome receiver (bounce, complaint, unsubscribe).
 *
 * Lovable enforces suppression itself before every send, so nothing here gates
 * future sends. These writes exist purely so the owner reporting surfaces
 * (email_send_log, suppressed_emails) and the CRM contact opt-out flag keep
 * reflecting what happened in the inbox.
 */

type Reason = 'bounce' | 'complaint' | 'unsubscribe'

function logStatus(reason: Reason): 'bounced' | 'complained' | 'suppressed' {
  if (reason === 'bounce') return 'bounced'
  if (reason === 'complaint') return 'complained'
  return 'suppressed'
}

function logMessage(reason: Reason): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce — email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint — recipient marked email as spam'
    default:
      return 'Recipient unsubscribed'
  }
}

function adminClient(): SupabaseClient {
  const supabaseUrl = process.env['SUPABASE_URL'] ?? import.meta.env.VITE_SUPABASE_URL
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!supabaseUrl || !serviceKey) throw new Error('Server configuration error')
  return createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
}

async function recordOutcome(recipient: string, reason: Reason, eventId: string, messageId?: string) {
  const supabase = adminClient()
  const email = recipient.trim().toLowerCase()

  // 1. Suppression mirror — idempotent, safe on redelivery.
  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert({ email, reason, metadata: null }, { onConflict: 'email' })
  if (suppressError) {
    console.error('suppressed_emails upsert failed', {
      event_id: eventId,
      code: suppressError.code,
      message: suppressError.message,
    })
    throw new Error('Failed to write suppression')
  }

  // 2. Append-only reporting row.
  const { error: insertError } = await supabase.from('email_send_log').insert({
    message_id: messageId ?? null,
    template_name: 'system',
    recipient_email: email,
    status: logStatus(reason),
    error_message: logMessage(reason),
    metadata: null,
  } as never)
  if (insertError) {
    console.warn('email_send_log insert failed', {
      event_id: eventId,
      code: insertError.code,
      message: insertError.message,
    })
  }

  // 3. CRM opt-out mirror so the Contacts UI reflects an unsubscribe.
  if (reason === 'unsubscribe') {
    const { error: contactError } = await supabase
      .from('contacts')
      .update({ email_opt_out: true } as never)
      .eq('email_norm', email)
    if (contactError) {
      console.warn('contacts opt-out mirror failed', {
        event_id: eventId,
        code: contactError.code,
        message: contactError.message,
      })
    }
  }
}

export const Route = createFileRoute("/lovable/email/events")({
  server: {
    handlers: {
      POST: ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']
        if (!apiKey) {
          console.error('Missing required environment variables')
          return Response.json({ error: 'Server configuration error' }, { status: 500 })
        }
        const handler = createEmailWebhookHandler({
          apiKey,
          on: {
            'email.bounced': async (event) => {
              await recordOutcome(event.data.recipient, 'bounce', event.event_id, event.data.message_id)
            },
            'email.complaint': async (event) => {
              await recordOutcome(event.data.recipient, 'complaint', event.event_id, event.data.message_id)
            },
            'email.unsubscribed': async (event) => {
              await recordOutcome(event.data.recipient, 'unsubscribe', event.event_id, event.data.message_id)
            },
          },
        })
        return handler(request)
      },
    },
  },
})
