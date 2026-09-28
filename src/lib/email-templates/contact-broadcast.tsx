import * as React from 'react'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Button, Link,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  subject?: string
  body?: string
  senderName?: string
  ctaUrl?: string | null
  ctaLabel?: string | null
  rsvpUrl?: string | null
  joinUrl?: string | null
  meetingId?: string | null
  meetingPasscode?: string | null
  hostName?: string | null
  hostPhone?: string | null
  hostPhoneLabel?: string | null
  hostEmail?: string | null
  hostNote?: string | null
}

// Schedules put this marker where {rsvp} was, so the email shows words, not a raw URL.
const RSVP_MARK = '[[rsvp_link]]'
function renderBody(body: string, rsvpUrl?: string | null): React.ReactNode {
  if (!body.includes(RSVP_MARK)) return body
  const parts = body.split(RSVP_MARK)
  return parts.flatMap((part, i) =>
    i === 0 ? [part] : [rsvpUrl ? <Link key={i} href={rsvpUrl} style={link}>Will you be there?</Link> : 'Will you be there?', part],
  )
}

const Email = ({ subject, body, senderName, ctaUrl, ctaLabel, rsvpUrl, joinUrl, meetingId, meetingPasscode, hostName, hostPhone, hostPhoneLabel, hostEmail, hostNote }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{subject || 'A message from ' + (senderName || 'The Kenroe Collective')}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section>
          <Heading style={h1}>{subject || 'A note for you'}</Heading>
          <Text style={p}>{renderBody(body || '', rsvpUrl)}</Text>
          {joinUrl ? <Section style={{ textAlign: 'center', margin: '24px 0 10px' }}><Button href={joinUrl} style={btn}>Join the call</Button></Section> : null}
          {meetingId ? <Text style={detailLine}><strong>Meeting ID:</strong> {meetingId}</Text> : null}
          {meetingPasscode ? <Text style={detailLine}><strong>Passcode:</strong> {meetingPasscode}</Text> : null}
          {ctaUrl ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={ctaUrl} style={btn}>{ctaLabel || 'Open'}</Button>
            </Section>
          ) : null}
          {rsvpUrl ? (
            <Section style={{ textAlign: 'center', margin: '0 0 24px' }}>
              <Button href={rsvpUrl} style={btn}>Will you be there?</Button>
            </Section>
          ) : null}
          {hostName || hostPhone || hostEmail ? (
            <Section style={hostBox}>
              <Text style={hostLabel}>Your host</Text>
              {hostName ? <Text style={hostLine}>{hostName}</Text> : null}
              {hostPhone ? <Text style={hostLine}><Link href={`tel:${hostPhone}`} style={link}>{hostPhoneLabel || hostPhone}</Link></Text> : null}
              {hostEmail ? <Text style={hostLine}><Link href={`mailto:${hostEmail}`} style={link}>{hostEmail}</Link></Text> : null}
              {hostNote ? <Text style={{ ...hostLine, color: '#555' }}>{hostNote}</Text> : null}
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
const link = { color: '#4b1e2b', textDecoration: 'underline' }
const hostBox = { backgroundColor: '#f8f6f2', borderRadius: '10px', padding: '12px 16px', margin: '16px 0 0' }
const hostLabel = { fontSize: '12px', color: '#888', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
const hostLine = { fontSize: '14px', color: '#222', margin: '2px 0' }
const detailLine = { fontSize: '14px', color: '#222', margin: '2px 0', textAlign: 'center' as const }
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
