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
import { normalizeHexColor, readableShade } from '@/lib/color-contrast'

interface Props {
  guestName?: string
  hostName?: string
  eventTitle?: string
  whenLine?: string
  venue?: string
  answer?: 'yes' | 'maybe' | 'no'
  status?: string
  confirmation?: string
  inviteUrl?: string
  accentColor?: string
}

const CARD_BG = '#fafaf7'
const DEFAULT_ACCENT = '#5c1d1d'

/**
 * Proof the answer was recorded. Sent immediately after a one-tap RSVP so a
 * first-time or elderly guest is never left wondering, and never RSVPs twice.
 */
const RsvpConfirmationEmail = ({
  guestName = 'there',
  hostName = '',
  eventTitle = 'your event',
  whenLine = '',
  venue = '',
  answer = 'yes',
  confirmation = '',
  inviteUrl = 'https://thekenroecollective.com',
  accentColor,
}: Props) => {
  const rawAccent = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT
  const accentText = readableShade(rawAccent, CARD_BG)
  const headline =
    answer === 'yes'
      ? "You're confirmed"
      : answer === 'maybe'
        ? "You're marked as a maybe"
        : 'Your answer is saved'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${headline} for ${eventTitle}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...card, borderColor: rawAccent }}>
            <Text style={{ ...eyebrow, color: accentText }}>{eventTitle}</Text>
            <Heading style={heading}>{headline}</Heading>
            <Text style={paragraph}>Hi {guestName},</Text>
            <Text style={paragraph}>
              {confirmation ||
                `Thank you for answering. Your response for ${eventTitle} has been saved.`}
            </Text>
            {whenLine && (
              <Text style={detail}>
                <strong>When:</strong> {whenLine}
              </Text>
            )}
            {venue && (
              <Text style={detail}>
                <strong>Where:</strong> {venue}
              </Text>
            )}
            <Text style={paragraph}>
              Nothing else is needed. If you want to add anything, such as who is coming with you or
              a food allergy, you can do that here:
            </Text>
            <Section style={{ textAlign: 'center', margin: '20px 0 8px' }}>
              <Link href={inviteUrl} style={{ ...button, backgroundColor: rawAccent }}>
                Open my invitation
              </Link>
            </Section>
            <Text style={smallNote}>
              You can change your answer at any time using the same link.
            </Text>
          </Section>
          <Text style={footer}>
            {hostName ? `Sent on behalf of ${hostName}.` : 'Sent by your host.'} The Kenroe Collective
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RsvpConfirmationEmail,
  subject: (data: Record<string, any>) =>
    data?.answer === 'no'
      ? `Answer saved for ${data?.eventTitle || 'your event'}`
      : `You're confirmed for ${data?.eventTitle || 'your event'}`,
  displayName: 'RSVP confirmation',
  previewData: {
    guestName: 'Margaret',
    hostName: 'Christopher',
    eventTitle: 'Kendrick Family Reunion',
    whenLine: 'Saturday, August 29, 2026 at 6:00 PM EDT',
    venue: 'The Kenroe Estate',
    answer: 'yes',
    confirmation:
      "You're confirmed. We'll see you Saturday, August 29, 2026 at 6:00 PM EDT at The Kenroe Estate.",
    inviteUrl: 'https://thekenroecollective.com/invite/sample?g=demo',
    accentColor: '#5c1d1d',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: CARD_BG }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, margin: '0 0 10px', textAlign: 'center' as const }
const heading = { fontSize: '26px', color: '#1a1a1a', margin: '0 0 18px', textAlign: 'center' as const }
const paragraph = { fontSize: '16px', lineHeight: '1.7', color: '#333', margin: '0 0 14px' }
const detail = { fontSize: '16px', lineHeight: '1.6', color: '#333', margin: '0 0 6px' }
const button = { display: 'inline-block', color: '#ffffff', padding: '16px 30px', borderRadius: '999px', fontSize: '17px', textDecoration: 'none', fontWeight: 700 }
const smallNote = { fontSize: '13px', color: '#666', margin: '16px 0 0', textAlign: 'center' as const }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const }
