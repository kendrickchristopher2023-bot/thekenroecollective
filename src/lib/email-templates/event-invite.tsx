import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'
import { contrastRatio, normalizeHexColor, readableShade } from '@/lib/color-contrast'

interface Props {
  guestName?: string
  hostName?: string
  eventTitle?: string
  eventDate?: string
  eventTime?: string
  venue?: string
  address?: string
  coverImage?: string
  message?: string
  inviteUrl?: string
  /** Event "Card & border color" — the accent the invitation page inherits. */
  accentColor?: string
  /** Optional host-chosen invitation text color. */
  textColor?: string
  /** Optional host crest/logo. */
  logo?: string
  /** One-tap answer links. When present, the guest can answer from the inbox. */
  rsvpYesUrl?: string
  rsvpMaybeUrl?: string
  rsvpNoUrl?: string
}

const CARD_BG = '#fafaf7'
const DEFAULT_ACCENT = '#5c1d1d'
const DEFAULT_INK = '#1a1a1a'

const EventInviteEmail = ({
  guestName = 'there',
  hostName = '',
  eventTitle = "You're invited",
  eventDate = '',
  eventTime = '',
  venue = '',
  address = '',
  coverImage,
  message = '',
  inviteUrl = 'https://thekenroecollective.com',
  accentColor,
  textColor,
  logo,
  rsvpYesUrl,
  rsvpMaybeUrl,
  rsvpNoUrl,
}: Props) => {
  const whenLine = [eventDate, eventTime].filter(Boolean).join(' · ')
  const whereLine = [venue, address].filter(Boolean).join(' · ')

  // Preview text is the second line in the inbox list. It has to carry
  // recognisable specifics (occasion, date, venue) so a guest can identify the
  // message without opening it.
  const previewText = [eventTitle, whenLine, venue].filter(Boolean).join(' · ')

  // Host colors are free-form hex, so a pale gold can land unreadable on the
  // cream email card. Keep the hue, walk it to a readable shade for anything
  // that carries words; the raw color is fine for borders and button fills.
  const rawAccent = normalizeHexColor(accentColor) ?? DEFAULT_ACCENT
  const accentText = readableShade(rawAccent, CARD_BG)
  const rawInk = normalizeHexColor(textColor)
  const inkText = rawInk ? readableShade(rawInk, CARD_BG) : DEFAULT_INK
  const buttonInk = contrastRatio(rawAccent, '#ffffff') >= 4 ? '#ffffff' : DEFAULT_INK

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={{ ...eyebrow, color: accentText }}>{eventTitle}</Text>
          <Section style={{ ...card, borderColor: rawAccent }}>
            {logo && (
              <Section style={{ textAlign: 'center', margin: '0 0 16px' }}>
                <Img src={logo} alt={hostName || eventTitle} width="88" style={crest} />
              </Section>
            )}
            {coverImage && (
              <Img
                src={coverImage}
                alt={eventTitle}
                width="536"
                style={cover}
              />
            )}
            <Text style={{ ...youreInvited, color: accentText }}>You're invited</Text>
            <Heading style={{ ...heading, color: inkText }}>{eventTitle}</Heading>
            {whenLine && <Text style={{ ...when, color: rawInk ? inkText : accentText }}>{whenLine}</Text>}
            {whereLine && <Text style={{ ...where, ...(rawInk ? { color: inkText } : null) }}>{whereLine}</Text>}

            {/* The question comes first. One tap here records the answer, which
                is the difference between an RSVP and a lost guest for anyone who
                is not comfortable navigating a web page. */}
            {(rsvpYesUrl || rsvpMaybeUrl || rsvpNoUrl) && (
              <Section style={answerBlock}>
                <Text style={{ ...answerPrompt, color: accentText }}>Will you join us?</Text>
                {rsvpYesUrl && (
                  <Section style={{ textAlign: 'center', margin: '0 0 10px' }}>
                    <Link href={rsvpYesUrl} style={{ ...answerButton, backgroundColor: rawAccent, color: buttonInk }}>
                      Joyfully accepts
                    </Link>
                  </Section>
                )}
                {rsvpMaybeUrl && (
                  <Section style={{ textAlign: 'center', margin: '0 0 10px' }}>
                    <Link href={rsvpMaybeUrl} style={{ ...answerButtonQuiet, borderColor: rawAccent, color: accentText }}>
                      Will try to make it
                    </Link>

                  </Section>
                )}
                {rsvpNoUrl && (
                  <Section style={{ textAlign: 'center', margin: '0' }}>
                    <Link href={rsvpNoUrl} style={{ ...answerButtonQuiet, borderColor: rawAccent, color: accentText }}>
                      Regretfully declines
                    </Link>
                  </Section>
                )}
                <Text style={answerNote}>
                  One tap saves your answer. You can add details, or change your answer, afterwards.
                </Text>
              </Section>
            )}

            {/* Who sent this and why you got it — stated up front, because an
                unfamiliar sender is the main reason invitations get deleted. */}
            <Text style={attribution}>
              {hostName
                ? `${hostName} is organising ${eventTitle} and added you to the guest list.`
                : `Your host is organising ${eventTitle} and added you to the guest list.`}
            </Text>

            <Text style={greeting}>
              {guestName ? `Dear ${guestName},` : 'Dear friend,'}
            </Text>
            {message && <Text style={messageStyle}>{message}</Text>}
            {hostName && (
              <Text style={signoff}>With love,<br />{hostName}</Text>
            )}


            <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
              <Link
                href={inviteUrl}
                style={{ ...primaryButton, backgroundColor: rawAccent, color: buttonInk }}
              >
                View invitation &amp; RSVP
              </Link>
            </Section>
            <Text style={smallNote}>
              Or open the invitation directly:{' '}
              <Link href={inviteUrl} style={{ ...inlineLink, color: accentText }}>{inviteUrl}</Link>
            </Text>
          </Section>
          <Text style={footer}>
            You're receiving this because {hostName || 'your host'} added you to the guest list on The Kenroe Collective.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: EventInviteEmail,
  // The event name is the trust signal, so it leads. The host name follows in
  // the From: display name, not the subject.
  subject: (data: Record<string, any>) =>
    `You're invited: ${data?.eventTitle || 'A special gathering'}`,
  displayName: 'Event invitation',
  previewData: {
    guestName: 'Alex',
    hostName: 'Christopher',
    eventTitle: "A Summer's Feast",
    eventDate: 'Friday, July 31, 2026',
    eventTime: '6:30 PM',
    venue: 'The Kenroe Estate',
    address: 'Concord, NC',
    message: "Join us for an evening of good food, better company, and a toast to summer.",
    inviteUrl: 'https://thekenroecollective.com/invite/sample',
    accentColor: '#5c1d1d',
    rsvpYesUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=yes',
    rsvpMaybeUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=maybe',
    rsvpNoUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=no',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: CARD_BG }
const cover = { width: '100%', height: 'auto', borderRadius: '12px', margin: '0 0 20px', display: 'block' }
const crest = { width: '88px', height: 'auto', margin: '0 auto', display: 'block' }
const youreInvited = { fontSize: '11px', letterSpacing: '0.3em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 6px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const heading = { fontSize: '28px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.15' }
const when = { fontSize: '14px', color: '#5c1d1d', margin: '0 0 4px', textAlign: 'center' as const, fontWeight: 600, fontFamily: 'Arial, sans-serif' }
const where = { fontSize: '13px', color: '#5a5a5a', margin: '0 0 20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const attribution = { fontSize: '13px', lineHeight: '1.6', color: '#5a5a5a', margin: '0 0 4px', padding: '12px 14px', backgroundColor: '#f2ece6', borderRadius: '10px', fontFamily: 'Arial, sans-serif' }
const greeting = { fontSize: '15px', color: '#333', margin: '18px 0 10px', fontFamily: 'Arial, sans-serif' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 14px', whiteSpace: 'pre-wrap' as const, fontFamily: 'Arial, sans-serif' }
const signoff = { fontSize: '14px', color: '#333', margin: '10px 0 4px', fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const smallNote = { fontSize: '11px', color: '#888', margin: '18px 0 0', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const inlineLink = { color: '#5c1d1d', textDecoration: 'underline', wordBreak: 'break-all' as const }
const answerBlock = { margin: '4px 0 18px', padding: '18px 14px', backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '14px' }
const answerPrompt = { fontSize: '18px', fontWeight: 700, margin: '0 0 14px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerButton = { display: 'block', padding: '16px 24px', borderRadius: '999px', fontSize: '18px', textDecoration: 'none', fontWeight: 700, textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerButtonQuiet = { display: 'block', padding: '15px 24px', borderRadius: '999px', border: '2px solid #5c1d1d', backgroundColor: '#ffffff', fontSize: '17px', textDecoration: 'none', fontWeight: 600, textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerNote = { fontSize: '13px', color: '#666', margin: '14px 0 0', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
