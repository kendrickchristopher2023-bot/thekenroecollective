import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const schema = z.object({ token: z.string().min(16).max(128) })

interface GuestMatch {
  eventId: string
  eventTitle: string
  guest: Record<string, unknown>
}

async function findGuestMatches(admin: any, email: string): Promise<GuestMatch[]> {
  const { data: events } = await admin
    .from('events')
    .select('id, data')
    .not('data', 'is', null)
  const lower = email.toLowerCase()
  const matches: GuestMatch[] = []
  for (const row of (events ?? []) as Array<{ id: string; data: any }>) {
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

export const Route = createFileRoute('/api/public/guest-privacy/verify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        const parsed = schema.safeParse(body)
        if (!parsed.success) {
          return Response.json({ error: 'invalid_token' }, { status: 400 })
        }

        const admin = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: req } = await admin
          .from('guest_privacy_requests')
          .select('id, email, status, expires_at')
          .eq('token', parsed.data.token)
          .maybeSingle()

        if (!req) {
          return Response.json({ status: 'invalid' }, { status: 404 })
        }
        if (new Date(req.expires_at as string).getTime() < Date.now()) {
          return Response.json({ status: 'expired' }, { status: 410 })
        }
        if (req.status === 'used') {
          return Response.json({ status: 'used' }, { status: 410 })
        }

        const matches = await findGuestMatches(admin, req.email as string)

        // Mark as verified on first successful load (still allows the deletion
        // action to run against the same token until the request is finalized).
        if (req.status === 'pending') {
          await admin
            .from('guest_privacy_requests')
            .update({ status: 'verified' })
            .eq('id', req.id)
        }

        return Response.json({
          status: req.status === 'deletion_requested' ? 'deletion_requested' : 'ok',
          email: req.email,
          records: matches,
        })
      },
    },
  },
})
