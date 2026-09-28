import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventName?: string
  guestName?: string
  partyLabel?: string
  contact?: string
  note?: string
  owed?: string
  capacityNote?: string
  manageUrl?: string
}

const Email = ({
  eventName = 'your event',
  guestName = 'A guest',
  partyLabel = '',
  contact = '',
  note = '',
  owed = '',
  capacityNote = '',
  manageUrl = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Someone is still waiting to hear back about your guest list</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Someone is still waiting</Heading>
        <Text style={text}>
          <strong>{partyLabel || guestName}</strong> asked to join <strong>{eventName}</strong> a
          couple of days ago and hasn&apos;t heard back yet. A quick yes or no is all it takes.
        </Text>
        {contact ? <Text style={text}>Contact: {contact}</Text> : null}
        {note ? <Text style={text}>Note: {note}</Text> : null}
        {owed ? <Text style={text}>Their party would owe: {owed}</Text> : null}
        {capacityNote ? <Text style={text}>Capacity: {capacityNote}</Text> : null}
        {manageUrl ? (
          <Text style={text}>
            Review the request: <a href={manageUrl}>{manageUrl}</a>
          </Text>
        ) : null}
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Still waiting: someone asked to join your guest list',
  displayName: 'Join request reminder',
  previewData: {
    eventName: 'Sunset Rooftop Party',
    guestName: 'Wren Alvarez',
    partyLabel: 'Wren Alvarez + 1 guest = 2 people',
    contact: 'wren@example.com',
    owed: '$50.00',
    capacityNote: 'Fits, 3 of your cap left',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
