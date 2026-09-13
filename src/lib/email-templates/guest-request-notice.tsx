import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventName?: string
  guestName?: string
  partyLabel?: string
  owed?: string
  capacityNote?: string
  contact?: string
  note?: string
  manageUrl?: string
}

const Email = ({
  eventName = 'your event',
  guestName = 'A guest',
  partyLabel = '',
  owed = '',
  capacityNote = '',
  contact = '',
  note = '',
  manageUrl = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Someone asked to be added to your guest list</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Someone asked to join</Heading>
        <Text style={text}>
          <strong>{partyLabel || guestName}</strong> couldn&apos;t find their name on the guest
          list for <strong> {eventName}</strong> and asked to be added.
        </Text>
        {owed ? <Text style={text}>Their party would owe: {owed}</Text> : null}
        {capacityNote ? <Text style={text}>Capacity: {capacityNote}</Text> : null}
        {contact ? <Text style={text}>Contact: {contact}</Text> : null}
        {note ? <Text style={text}>Note: {note}</Text> : null}
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
  subject: 'Someone asked to join your guest list, The Kenroe Collective',
  displayName: 'Guest join request',
  previewData: {
    eventName: 'Sunset Rooftop Party',
    guestName: 'Wren Alvarez',
    contact: 'wren@example.com',
    partyLabel: 'Wren Alvarez + 1 guest = 2 people',
    owed: '$50.00',
    capacityNote: 'Fits, 3 of your cap left',
    note: 'I think I was invited under my work email.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
