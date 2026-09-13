import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

/**
 * "A place opened up" — sent when a waitlisted party is promoted, whether by
 * the host or automatically. Always names the whole party, because a party is
 * never partially promoted: if this email arrives, everyone in it is in.
 */
interface Props {
  eventName?: string
  guestName?: string
  partyPhrase?: string
  whenLine?: string
  venue?: string
  inviteUrl?: string
}

const Email = ({
  eventName = 'the event',
  guestName = 'there',
  partyPhrase = '',
  whenLine = '',
  venue = '',
  inviteUrl = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A place opened up for {eventName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Good news, a place opened up</Heading>
        <Text style={text}>Hi {guestName},</Text>
        <Text style={text}>
          A place has opened up for <strong>{eventName}</strong>, and you are off the waitlist. You
          are confirmed.
        </Text>
        {partyPhrase ? <Text style={text}>Your party: {partyPhrase}.</Text> : null}
        {whenLine ? <Text style={text}>When: {whenLine}</Text> : null}
        {venue ? <Text style={text}>Where: {venue}</Text> : null}
        <Text style={text}>
          Please open your invitation to check your details, and let the host know as soon as
          possible if you can no longer make it, so the place can go to someone else.
        </Text>
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
    `A place opened up for ${d?.eventName || 'your event'}`,
  displayName: 'Waitlist promoted',
  previewData: {
    eventName: 'Kendrick Family Reunion',
    guestName: 'Moses Little',
    partyPhrase: '2 adults + 2 children = 4 people',
    whenLine: 'Saturday, August 29, 2026 at 6:00 PM EDT',
    venue: 'The Grand Hall',
    inviteUrl: 'https://thekenroecollective.com/invite/demo',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
