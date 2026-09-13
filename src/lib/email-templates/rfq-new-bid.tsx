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
  vendorName?: string
  subject?: string
  bidAmount?: number
  availabilityNote?: string
  body?: string
  threadUrl?: string
}

const RfqNewBidEmail = ({
  vendorName = 'A vendor',
  subject = 'your event request',
  bidAmount,
  availabilityNote = '',
  body = '',
  threadUrl = 'https://thekenroecollective.com',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{vendorName} sent a bid on {subject}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Text style={eyebrow}>The Kenroe Collective</Text>
          <Heading style={heading}>New bid on "{subject}"</Heading>
          <Text style={para}>
            <strong>{vendorName}</strong> just responded to your request for quotes.
          </Text>
          {typeof bidAmount === 'number' && bidAmount > 0 && (
            <Text style={amount}>${bidAmount.toLocaleString()}</Text>
          )}
          {availabilityNote && <Text style={meta}>Availability: {availabilityNote}</Text>}
          {body && (
            <Section style={briefBox}>
              <Text style={briefText}>{body}</Text>
            </Section>
          )}
          <Link href={threadUrl} style={primaryButton}>Open the thread</Link>
        </Section>
        <Text style={footer}>
          You can compare bids, message the vendor, and award the job from your RFQ inbox.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: RfqNewBidEmail,
  subject: (data: Record<string, any>) => `New bid from ${data?.vendorName || 'a vendor'}`,
  displayName: 'RFQ — new bid received',
  previewData: {
    vendorName: 'Acme Florals',
    subject: 'Spring garden wedding florals',
    bidAmount: 4200,
    availabilityNote: 'Available May 12, deposit due 30 days prior',
    body: 'Happy to provide all centerpieces and bouquets in the dusty-rose palette.',
    threadUrl: 'https://thekenroecollective.com/rfq/sample',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const card = { padding: '28px', border: '1px solid #ececec', borderRadius: '14px', backgroundColor: '#fafaf7' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#6b6b6b', margin: '0 0 12px' }
const heading = { fontSize: '22px', color: '#111', margin: '0 0 14px', fontFamily: 'Georgia, serif' }
const para = { fontSize: '14px', lineHeight: '1.6', color: '#333', margin: '0 0 12px' }
const amount = { fontSize: '28px', color: '#5c1d1d', margin: '6px 0 14px', fontWeight: 700, fontFamily: 'Georgia, serif' }
const meta = { fontSize: '13px', color: '#444', margin: '0 0 12px' }
const briefBox = { padding: '14px 16px', backgroundColor: '#fff', border: '1px solid #ececec', borderRadius: '10px', margin: '0 0 18px' }
const briefText = { fontSize: '13px', lineHeight: '1.6', color: '#444', whiteSpace: 'pre-wrap' as const, margin: 0 }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#fff', padding: '12px 22px', borderRadius: '999px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const }
