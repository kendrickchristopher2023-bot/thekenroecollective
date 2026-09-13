import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Button, Link, Img,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  title?: string
  body?: string
  type_label?: string
  event_title?: string | null
  link_url?: string | null
  link_label?: string | null
  /** Absolute https event cover. Unsafe URLs are stripped on the send path. */
  coverImage?: string
}

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  venue_change: { label: 'Venue Change', color: '#7c3aed' },
  cancellation: { label: 'Cancellation', color: '#b91c1c' },
  date_change:  { label: 'Date Change',  color: '#0f766e' },
  general:      { label: 'Update',       color: '#1f2937' },
}

const Email = ({ title, body, type_label, event_title, link_url, link_label, coverImage }: Props) => {
  const badge = TYPE_BADGE[type_label || 'general'] ?? TYPE_BADGE.general
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title || 'An update from The Kenroe Collective'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ textAlign: 'center', paddingTop: 8 }}>
            <Text style={brand}>KENROE’S COLLECTIVE</Text>
          </Section>

          {coverImage && (
            <Section style={{ textAlign: 'center', marginTop: 16 }}>
              <Img src={coverImage} alt={event_title || title || 'Event'} width="504" style={cover} />
            </Section>
          )}

          <Section style={{ marginTop: 16 }}>
            <Text style={{ ...pill, backgroundColor: badge.color }}>{badge.label.toUpperCase()}</Text>
            <Heading style={h1}>{title || 'An important update'}</Heading>
            {event_title && <Text style={eventLine}>For: {event_title}</Text>}
          </Section>

          <Section>
            {(body || '').split(/\n\n+/).map((p, i) => (
              <Text key={i} style={para}>{p}</Text>
            ))}
          </Section>

          {link_url && (
            <Section style={{ textAlign: 'center', marginTop: 24 }}>
              <Button href={link_url} style={btn}>
                {link_label || 'View details'}
              </Button>
            </Section>
          )}

          <Hr style={hr} />
          <Text style={signoff}>— The Kenroe Collective</Text>
          <Text style={footer}>
            You’re receiving this because an event you’re part of has an update.
            Visit <Link href="https://thekenroecollective.com" style={link}>thekenroecollective.com</Link>.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => (d.title ? String(d.title) : 'An update from The Kenroe Collective'),
  displayName: 'Event announcement',
  previewData: {
    title: 'Venue moved to The Glass Pavilion',
    body: 'We’ve moved the venue to The Glass Pavilion downtown.\n\nThe time stays the same. Parking is on Cedar Street.',
    type_label: 'venue_change',
    event_title: 'Maya & James — Welcome Dinner',
    link_url: 'https://thekenroecollective.com',
    link_label: 'See full details',
  },
} satisfies TemplateEntry

const cover: React.CSSProperties = { width: '100%', maxWidth: 504, maxHeight: 260, objectFit: 'contain', borderRadius: 10, margin: 0 }
const main: React.CSSProperties = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Cormorant Garamond", serif', margin: 0, padding: '24px 0' }
const container: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '28px 28px 36px', backgroundColor: '#ffffff', border: '1px solid #ecebe6', borderRadius: 14 }
const brand: React.CSSProperties = { fontSize: 11, letterSpacing: 4, color: '#6b6558', margin: 0, fontFamily: 'Geist, Helvetica, Arial, sans-serif' }
const pill: React.CSSProperties = { display: 'inline-block', color: '#ffffff', fontSize: 10, letterSpacing: 1.4, padding: '4px 10px', borderRadius: 999, fontFamily: 'Geist, Helvetica, Arial, sans-serif', margin: '0 0 10px' }
const h1: React.CSSProperties = { fontSize: 26, lineHeight: 1.25, color: '#1a1a1a', margin: '4px 0 6px', fontWeight: 500 }
const eventLine: React.CSSProperties = { fontSize: 13, color: '#6b6558', margin: 0 }
const para: React.CSSProperties = { fontSize: 15, lineHeight: 1.65, color: '#2a2a2a', margin: '14px 0' }
const btn: React.CSSProperties = { backgroundColor: '#1a1a1a', color: '#ffffff', padding: '12px 22px', borderRadius: 999, fontSize: 13, textDecoration: 'none', fontFamily: 'Geist, Helvetica, Arial, sans-serif', letterSpacing: 0.4 }
const hr: React.CSSProperties = { borderColor: '#ecebe6', margin: '28px 0 14px' }
const signoff: React.CSSProperties = { fontSize: 14, color: '#1a1a1a', margin: '6px 0 14px', fontStyle: 'italic' }
const footer: React.CSSProperties = { fontSize: 11, color: '#8a8472', lineHeight: 1.5, margin: 0, fontFamily: 'Geist, Helvetica, Arial, sans-serif' }
const link: React.CSSProperties = { color: '#1a1a1a', textDecoration: 'underline' }
