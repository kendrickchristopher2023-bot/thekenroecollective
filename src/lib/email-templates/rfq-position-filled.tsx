import {
  Body,
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
  vendorName?: string
  subject?: string
}

const RfqPositionFilledEmail = ({
  vendorName = 'there',
  subject = 'the recent event request',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Update on your recent quote — position filled</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Thanks for your bid, {vendorName}</Heading>
        <Text style={text}>
          The host on <strong>{subject}</strong> has selected another vendor for this booking.
          We wanted to let you know promptly so you can plan your calendar.
        </Text>
        <Text style={text}>
          You'll continue to receive RFQ invitations that match your category and service area.
          We appreciate the time you put into your response.
        </Text>
        <Section style={{ marginTop: 24 }}>
          <Text style={muted}>— The Kenroe Collective</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RfqPositionFilledEmail,
  subject: (d: Record<string, any>) =>
    `Update on your bid — ${d?.subject ?? 'event request'}`,
  displayName: 'RFQ — Position Filled',
  previewData: { vendorName: 'Acme Catering', subject: 'Garden Party 2026' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: 560 }
const h1 = { fontSize: 22, color: '#1a1a1a', margin: '0 0 12px' }
const text = { fontSize: 15, lineHeight: '22px', color: '#333', margin: '0 0 12px' }
const muted = { fontSize: 12, color: '#888' }
