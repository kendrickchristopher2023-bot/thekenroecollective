import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  verifyUrl: string
}

const Email = ({ verifyUrl = 'https://thekenroecollective.com/guest-privacy' }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Verify your Guest Privacy Request — The Kenroe Collective</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Verify your privacy request</Heading>
        <Text style={text}>
          We received a request to view or delete the personal information
          The Kenroe Collective holds about you as an event guest.
        </Text>
        <Text style={text}>
          Click the button below to verify this email address and continue.
          This link will expire in 24 hours.
        </Text>
        <Section style={{ margin: '28px 0' }}>
          <Button href={verifyUrl} style={button}>
            Verify and continue
          </Button>
        </Section>
        <Text style={small}>
          If the button doesn't work, copy this link into your browser:
        </Text>
        <Text style={{ ...small, wordBreak: 'break-all' }}>{verifyUrl}</Text>
        <Text style={footer}>
          If you didn't make this request, you can ignore this email — no
          action will be taken.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Verify your privacy request — The Kenroe Collective',
  displayName: 'Guest privacy verification',
  previewData: { verifyUrl: 'https://thekenroecollective.com/guest-privacy?token=abc123' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#111', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const small = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '0 0 6px' }
const footer = { fontSize: '12px', color: '#999', margin: '28px 0 0' }
const button = {
  backgroundColor: '#5B2A6A',
  color: '#fff',
  padding: '12px 20px',
  borderRadius: '999px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 500,
}
