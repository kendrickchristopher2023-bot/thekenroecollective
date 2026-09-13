import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventName?: string
  guestName?: string
  partyPhrase?: string
  amountDue?: string
  waitlisted?: boolean
  inviteUrl?: string
}

const Email = ({
  eventName = 'the event',
  guestName = 'there',
  partyPhrase = '',
  amountDue = '',
  waitlisted = false,
  inviteUrl = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{waitlisted ? 'You are on the waitlist' : 'You are on the guest list'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {waitlisted ? "You're on the waitlist" : "You're on the guest list"}
        </Heading>
        <Text style={text}>Hi {guestName},</Text>
        <Text style={text}>
          {waitlisted ? (
            <>
              The host added you to the waitlist for <strong>{eventName}</strong>. The event is at
              capacity right now, and you&apos;ll hear from them if a place opens up.
            </>
          ) : (
            <>
              The host added you to the guest list for <strong>{eventName}</strong>.
            </>
          )}
        </Text>
        {partyPhrase ? <Text style={text}>Your party: {partyPhrase}.</Text> : null}
        <Text style={text}>
          Next step: open your invitation and finish your RSVP, so the host has your details
          (who&apos;s coming, dietary needs, shirt sizes where offered
          {amountDue ? ', and payment' : ''}).
        </Text>
        {amountDue ? <Text style={text}>Amount due for your party: {amountDue}.</Text> : null}
        {inviteUrl ? (
          <Text style={text}>
            Your invitation: <a href={inviteUrl}>{inviteUrl}</a>
          </Text>
        ) : null}
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    d?.waitlisted ? "You're on the waitlist" : "You're in, finish your RSVP",
  displayName: 'Join request approved',
  previewData: {
    eventName: 'Sunset Rooftop Party',
    guestName: 'Moses Little',
    partyPhrase: '+ 1 guest = 2 people',
    amountDue: '$50.00',
    inviteUrl: 'https://thekenroecollective.com/invite/demo',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
