import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { enqueueTransactionalEmailServer } from '@/lib/email/server-enqueue.server'

const SUBMIT_LIMIT = 5
const WINDOW_MINUTES = 60

const submitSchema = z.object({
  email: z.string().trim().email().max(255),
})

interface GuestMatch {
  eventId: string
  eventTitle: string
  guest: {
    id?: string
    name?: string
    email?: string
    phone?: string
    address?: string
    status?: string
    invitedAt?: string
    respondedAt?: string
    adults?: number
    children?: number
    pets?: number
    category?: string
  }
}

function genToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function findGuestMatches(admin: any, email: string): Promise<GuestMatch[]> {
  const { data: events, error } = await admin
    .from('events')
    .select('id, data')
    .not('data', 'is', null)
  if (error || !events) return []
  const lower = email.toLowerCase()
  const matches: GuestMatch[] = []
  for (const row of events as Array<{ id: string; data: any }>) {
    const guests: any[] = Array.isArray(row.data?.guests) ? row.data.guests : []
    const title: string = String(row.data?.title ?? 'Untitled event')
    for (const g of guests) {
      if (typeof g?.email === 'string' && g.email.toLowerCase() === lower) {
        matches.push({
          eventId: row.id,
          eventTitle: title,
          guest: {
            id: g.id,
            name: g.name,
            email: g.email,
            phone: g.phone,
            address: g.address,
            status: g.status,
            invitedAt: g.invitedAt,
            respondedAt: g.respondedAt,
            adults: g.adults,
            children: g.children,
            pets: g.pets,
            category: g.category,
          },
        })
      }
    }
  }
  return matches
}

async function checkRateLimit(admin: any, email: string): Promise<boolean> {
  const now = new Date()
  const bucketMs = now.getTime() - (now.getTime() % (WINDOW_MINUTES * 60 * 1000))
  const window_start = new Date(bucketMs).toISOString()
  const { data: existing } = await admin
    .from('guest_privacy_rate_limit')
    .select('count')
    .eq('email', email)
    .eq('window_start', window_start)
    .maybeSingle()
  const current = (existing?.count as number | undefined) ?? 0
  if (current >= SUBMIT_LIMIT) return false
  await admin
    .from('guest_privacy_rate_limit')
    .upsert(
      { email, window_start, count: current + 1 },
      { onConflict: 'email,window_start' },
    )
  // opportunistic cleanup
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  await admin.from('guest_privacy_rate_limit').delete().lt('window_start', cutoff)
  return true
}

export const Route = createFileRoute('/api/public/guest-privacy/submit')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { enforceIpRateLimit } = await import('@/lib/rate-limit.server')
        const limited = enforceIpRateLimit(request, {
          scope: 'guest-privacy-submit',
          max: 5,
          windowMs: 15 * 60 * 1000,
        })
        if (limited) return limited

        const url = process.env.SUPABASE_URL
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!url || !key) {
          return Response.json({ error: 'server_not_configured' }, { status: 500 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'invalid_body' }, { status: 400 })
        }
        const parsed = submitSchema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: 'invalid_email' }, { status: 400 })
        }
        const email = parsed.data.email.toLowerCase()
        const admin = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })

        const allowed = await checkRateLimit(admin, email)
        if (!allowed) {
          return Response.json(
            { status: 'rate_limited' },
            { status: 429 },
          )
        }

        const matches = await findGuestMatches(admin, email)
        if (matches.length === 0) {
          // Do not persist anything for non-matches.
          return Response.json({ status: 'not_found' })
        }

        const token = genToken()
        const { error: insertErr } = await admin
          .from('guest_privacy_requests')
          .insert({ email, token, status: 'pending' })
        if (insertErr) {
          return Response.json({ error: 'insert_failed' }, { status: 500 })
        }

        const origin = new URL(request.url).origin
        const verifyUrl = `${origin}/guest-privacy?token=${token}`
        await enqueueTransactionalEmailServer({
          templateName: 'guest-privacy-verify',
          recipientEmail: email,
          idempotencyKey: `guest-privacy-${token}`,
          templateData: { verifyUrl },
          label: 'guest-privacy-verify',
        })

        return Response.json({ status: 'sent' })
      },
    },
  },
})
