import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const schema = z.object({ token: z.string().min(16).max(128) })

export const Route = createFileRoute('/api/public/guest-privacy/deletion')({
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
          .select('id, status, expires_at')
          .eq('token', parsed.data.token)
          .maybeSingle()
        if (!req) return Response.json({ status: 'invalid' }, { status: 404 })
        if (new Date(req.expires_at as string).getTime() < Date.now()) {
          return Response.json({ status: 'expired' }, { status: 410 })
        }
        if (!['pending', 'verified', 'deletion_requested'].includes(req.status as string)) {
          return Response.json({ status: 'used' }, { status: 410 })
        }
        await admin
          .from('guest_privacy_requests')
          .update({ status: 'deletion_requested' })
          .eq('id', req.id)
        return Response.json({ status: 'ok' })
      },
    },
  },
})
