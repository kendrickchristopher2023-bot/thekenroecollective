import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Button,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  subject?: string
  body?: string
  senderName?: string
  ctaUrl?: string | null
  ctaLabel?: string | null
}

const Email = ({ subject, body, senderName, ctaUrl, ctaLabel }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{subject || 'A message from ' + (senderName || 'The Kenroe Collective')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section>
          <Heading style={h1}>{subject || 'A note for you'}</Heading>
          <Text style={p}>{body || ''}</Text>
          {ctaUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={ctaUrl} style={btn}>{ctaLabel || 'Open'}</Button>
            </Section>
          ) : null}
          <Hr style={hr} />
          <Text style={foot}>Sent by {senderName || 'The Kenroe Collective'}.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#f8f6f2', fontFamily: 'Georgia, serif', padding: '24px 0' }
const container = { backgroundColor: '#ffffff', maxWidth: '560px', margin: '0 auto', padding: '32px', borderRadius: '12px' }
const h1 = { fontSize: '22px', fontWeight: 600, color: '#111', margin: '0 0 16px' }
const p = { fontSize: '15px', lineHeight: '1.6', color: '#333', whiteSpace: 'pre-wrap' as const }
const hr = { borderColor: '#eee', margin: '24px 0' }
const foot = { fontSize: '12px', color: '#888' }
const btn = { backgroundColor: '#4b1e2b', color: '#fff', padding: '12px 24px', borderRadius: '999px', textDecoration: 'none', fontSize: '14px' }

export const template: TemplateEntry = {
  component: Email,
  displayName: 'Contact broadcast',
  subject: (d) => (d?.subject as string) || 'A message from The Kenroe Collective',
  previewData: {
    subject: 'You’re invited — save the date',
    body: 'Hi friends,\n\nJust a note about our upcoming event.',
    senderName: 'Your host',
  },
}
