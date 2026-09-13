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
  category?: string
  location?: string
  eventDate?: string
  guestCount?: number
  budgetMax?: number
  brief?: string
  bidUrl?: string
  signInUrl?: string
}

const VendorRfqInviteEmail = ({
  vendorName = 'there',
  subject = 'New event request',
  category = '',
  location = '',
  eventDate = '',
  guestCount,
  budgetMax,
  brief = '',
  bidUrl = 'https://thekenroecollective.com',
  signInUrl = 'https://thekenroecollective.com/auth',
}: Props) => {
  const facts: string[] = []
  if (category) facts.push(category)
  if (location) facts.push(location)
  if (eventDate) facts.push(eventDate)
  if (guestCount) facts.push(`${guestCount} guests`)
  if (budgetMax) facts.push(`Budget up to $${budgetMax}`)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New event request through The Kenroe Collective — {subject}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Text style={eyebrow}>The Kenroe Collective</Text>
            <Heading style={heading}>New request: {subject}</Heading>
            <Text style={para}>Hello {vendorName},</Text>
            <Text style={para}>
              A host on The Kenroe Collective is gathering quotes from vetted vendors for an
              upcoming event and would like to hear from you.
            </Text>
            {facts.length > 0 && (
              <Text style={meta}>{facts.join('  •  ')}</Text>
            )}
            {brief && (
              <Section style={briefBox}>
                <Text style={briefText}>{brief}</Text>
              </Section>
            )}
            <Link href={bidUrl} style={primaryButton}>View &amp; submit a bid</Link>
            <Text style={smallNote}>
              No account needed for your first reply.{' '}
              <Link href={signInUrl} style={inlineLink}>Sign in</Link>{' '}
              if you'd like to continue the conversation in your inbox.
            </Text>
          </Section>
          <Text style={footer}>
            You're receiving this because your vendor profile on The Kenroe Collective matched
            this request.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: VendorRfqInviteEmail,
  subject: (data: Record<string, any>) =>
    `New request${data?.category ? ` (${data.category})` : ''}: ${data?.subject || 'Event quote'}`,
  displayName: 'Vendor RFQ invitation',
  previewData: {
    vendorName: 'Acme Florals',
    subject: 'Spring garden wedding florals',
    category: 'Florist',
    location: 'Brooklyn, NY',
    eventDate: '2026-05-12',
    guestCount: 120,
    budgetMax: 4500,
    brief: 'Garden ceremony, dusty-rose palette, 12 centerpieces and 4 bridesmaid bouquets.',
    bidUrl: 'https://thekenroecollective.com/rfq-bid/sampletoken',
    signInUrl: 'https://thekenroecollective.com/auth',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const card = { padding: '28px', border: '1px solid #ececec', borderRadius: '14px', backgroundColor: '#fafaf7' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#6b6b6b', margin: '0 0 12px' }
const heading = { fontSize: '22px', color: '#111', margin: '0 0 14px', fontFamily: 'Georgia, serif' }
const para = { fontSize: '14px', lineHeight: '1.6', color: '#333', margin: '0 0 12px' }
const meta = { fontSize: '13px', color: '#5c1d1d', margin: '6px 0 16px', fontWeight: 600 }
const briefBox = { padding: '14px 16px', backgroundColor: '#fff', border: '1px solid #ececec', borderRadius: '10px', margin: '0 0 18px' }
const briefText = { fontSize: '13px', lineHeight: '1.6', color: '#444', whiteSpace: 'pre-wrap' as const, margin: 0 }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#fff', padding: '12px 22px', borderRadius: '999px', fontSize: '14px', textDecoration: 'none', fontWeight: 600 }
const smallNote = { fontSize: '12px', color: '#666', margin: '16px 0 0' }
const inlineLink = { color: '#5c1d1d', textDecoration: 'underline' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const }
