import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  recipientName?: string
  occasion?: string
  messageCount?: number
  revealUrl?: string
  revealTimeLabel?: string
  dashboardUrl?: string
}

const EcardDeliveredEmail = ({
  recipientName = 'your recipient',
  occasion = 'the card',
  messageCount = 0,
  revealUrl = 'https://thekenroecollective.com',
  revealTimeLabel = '',
  dashboardUrl = 'https://thekenroecollective.com/ecards',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your group card for ${recipientName} has been delivered`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Delivered</Text>
        <Section style={card}>
          <Heading style={heading}>{`${occasion} for ${recipientName}`}</Heading>
          <Text style={messageStyle}>
            {`It is done. ${recipientName} has been emailed the link to their card, with ${messageCount} ${messageCount === 1 ? 'message' : 'messages'} inside.`}
          </Text>
          {revealTimeLabel ? (
            <Text style={messageStyle}>{`Reveal time: ${revealTimeLabel}.`}</Text>
          ) : null}
          <Text style={messageStyle}>
            Thank you for organizing it. The card stays online as a keepsake, so you can revisit it
            any time.
          </Text>
          <Section style={{ textAlign: 'center', margin: '26px 0 8px' }}>
            <Link href={revealUrl} style={primaryButton}>
              View the card
            </Link>
          </Section>
          <Text style={small}>
            <Link href={dashboardUrl} style={quietLink}>
              Manage this card
            </Link>
          </Text>
        </Section>
        <Text style={footer}>Group eCards by The Kenroe Collective.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EcardDeliveredEmail,
  subject: (data: Record<string, any>) =>
    `Your group card for ${data?.recipientName || 'your recipient'} has been delivered`,
  displayName: 'Group eCard delivered (organizer)',
  previewData: {
    recipientName: 'Priya',
    occasion: 'Happy Birthday',
    messageCount: 14,
    revealUrl: 'https://thekenroecollective.com/r/sample',
    dashboardUrl: 'https://thekenroecollective.com/ecards',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '24px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.2' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const small = { fontSize: '12px', color: '#666', margin: '10px 0 0', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const quietLink = { color: '#5c1d1d', textDecoration: 'underline' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
