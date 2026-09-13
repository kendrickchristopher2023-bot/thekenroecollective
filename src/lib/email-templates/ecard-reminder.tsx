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
  organizerName?: string
  recipientName?: string
  occasion?: string
  messageCount?: number
  revealDateLabel?: string
  daysLeft?: number
  shareUrl?: string
  dashboardUrl?: string
}

const EcardReminderEmail = ({
  recipientName = 'your recipient',
  occasion = 'A celebration',
  messageCount = 0,
  revealDateLabel = 'the reveal date',
  daysLeft = 3,
  shareUrl = 'https://thekenroecollective.com',
  dashboardUrl = 'https://thekenroecollective.com/ecards',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${daysLeft} days left to collect messages for ${recipientName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Group eCards reminder</Text>
        <Section style={card}>
          <Heading style={heading}>{`Time to collect a few more messages`}</Heading>
          <Text style={messageStyle}>
            {`Your card for ${recipientName} (${occasion}) opens on ${revealDateLabel}, which is about ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} away.`}
          </Text>
          <Text style={messageStyle}>
            {messageCount > 0
              ? `So far you have collected ${messageCount} ${messageCount === 1 ? 'message' : 'messages'}.`
              : 'No messages have been added yet.'}
          </Text>
          <Text style={messageStyle}>
            Contributors do not need an account, so the only way they get reminded is when you share
            the link again. A quick nudge in your group chat usually brings in a few more.
          </Text>
          <Section style={linkBox}>
            <Text style={linkLabel}>Contribution link</Text>
            <Link href={shareUrl} style={linkText}>
              {shareUrl}
            </Link>
          </Section>
          <Section style={{ textAlign: 'center', margin: '26px 0 8px' }}>
            <Link href={dashboardUrl} style={primaryButton}>
              Open your card dashboard
            </Link>
          </Section>
        </Section>
        <Text style={footer}>
          Group eCards by The Kenroe Collective. You are getting this because you created this card.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EcardReminderEmail,
  subject: (data: Record<string, any>) =>
    `${data?.daysLeft ?? 3} days left to collect messages for ${data?.recipientName || 'your card'}`,
  displayName: 'Group eCard organizer reminder',
  previewData: {
    recipientName: 'Layla',
    occasion: 'Congratulations',
    messageCount: 3,
    revealDateLabel: 'August 15, 2026',
    daysLeft: 3,
    shareUrl: 'https://thekenroecollective.com/c/sample',
    dashboardUrl: 'https://thekenroecollective.com/ecards',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '24px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.25' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const linkBox = { marginTop: '18px', padding: '14px 16px', borderRadius: '12px', backgroundColor: '#f2ede6' }
const linkLabel = { fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase' as const, color: '#7a6a5a', margin: '0 0 6px', fontFamily: 'Arial, sans-serif' }
const linkText = { fontSize: '13px', color: '#5c1d1d', wordBreak: 'break-all' as const, fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
