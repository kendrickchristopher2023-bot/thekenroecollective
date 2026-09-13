import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

const Email = () => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your data has been deleted — The Kenroe Collective</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your data has been deleted</Heading>
        <Text style={text}>
          Your information has been removed from all events organized through
          The Kenroe Collective. If you are invited to a future event, the
          host would need to re-enter your information.
        </Text>
        <Text style={footer}>The Kenroe Collective</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your data has been deleted - The Kenroe Collective',
  displayName: 'Guest data deletion confirmation',
  previewData: {},
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
