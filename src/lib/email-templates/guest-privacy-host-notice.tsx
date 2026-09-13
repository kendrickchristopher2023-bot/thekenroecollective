import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventName?: string
}

const Email = ({ eventName = 'your event' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A guest exercised their privacy rights</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Guest data removed</Heading>
        <Text style={text}>
          A guest exercised their privacy rights. Their data was removed from
          <strong> {eventName}</strong>. Their RSVP has been preserved as
          &quot;Deleted Guest&quot; so your headcount stays accurate.
        </Text>
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'A guest exercised privacy rights — The Kenroe Collective',
  displayName: 'Host privacy notice',
  previewData: { eventName: 'Sunset Rooftop Party' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
