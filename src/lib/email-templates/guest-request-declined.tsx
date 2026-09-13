import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventName?: string
  guestName?: string
  hostContact?: string
}

const Email = ({ eventName = 'the event', guestName = 'there', hostContact = '' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>An update on your request to join</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>An update on your request</Heading>
        <Text style={text}>Hi {guestName},</Text>
        <Text style={text}>
          Thank you for asking to join <strong>{eventName}</strong>. The host isn&apos;t able to add
          you to the guest list this time, often because the guest list is full or the invitation was
          meant for a smaller group.
        </Text>
        <Text style={text}>
          Nothing further is needed from you, and no payment was taken.
          {hostContact ? ` If you think this was a mix-up, you can reach the host at ${hostContact}.` : ''}
        </Text>
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'An update on your request to join',
  displayName: 'Join request declined',
  previewData: {
    eventName: 'Sunset Rooftop Party',
    guestName: 'Moses Little',
    hostContact: 'host@example.com',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
