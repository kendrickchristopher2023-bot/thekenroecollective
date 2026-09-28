import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  eventTitle?: string
  message?: string
  signOff?: string
  gif?: string
  photo?: string
  recipientName?: string
  /** Hosted page for a letter, poem, or song: it plays the piece and always
   *  prints the written words, so nobody needs sound to receive it. */
  pieceUrl?: string
  pieceTitle?: string
  pieceKind?: string
}

const ThankYouCardEmail = ({
  eventTitle = 'our celebration',
  message = 'Thank you so much for celebrating with us.',
  signOff = '',
  gif,
  photo,
  recipientName,
  pieceUrl,
  pieceTitle,
  pieceKind,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A thank-you note from {eventTitle}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Text style={eyebrow}>Thank you</Text>
          <Heading style={heading}>{eventTitle}</Heading>

          {photo && (
            <Img
              src={photo}
              alt={`A photo from ${eventTitle}`}
              width="520"
              style={hero}
            />
          )}

          {recipientName && (
            <Text style={greeting}>Dear {recipientName},</Text>
          )}

          <Text style={body}>{message}</Text>

          {gif && (
            <Section style={{ textAlign: 'center', marginTop: '24px' }}>
              {/* Width is advisory only: max-width plus height:auto keeps the
                  full frame visible, so a GIF that carries a written message
                  is never cropped. Outlook shows the first frame only. */}
              <Img
                src={gif}
                alt={`An animated thank-you from ${eventTitle}`}
                width="480"
                style={gifStyle}
              />
            </Section>
          )}


          {pieceUrl && (
            <Section style={pieceBox}>
              <Text style={pieceEyebrow}>
                {pieceKind === 'letter'
                  ? 'A letter for you, read aloud'
                  : pieceKind === 'poem'
                    ? 'A poem for you, read aloud'
                    : 'A song for you'}
              </Text>
              <Text style={pieceTitleStyle}>{pieceTitle ?? 'Made for this occasion'}</Text>
              <Link href={pieceUrl} style={pieceButton}>
                Listen to it
              </Link>
              <Text style={pieceNote}>
                The words are written out on the page too, so you can read it instead of listening.
              </Text>
            </Section>
          )}

          {signOff && (
            <>
              <Hr style={divider} />
              <Text style={sign}>— {signOff}</Text>
            </>
          )}
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ThankYouCardEmail,
  subject: (data: Record<string, any>) =>
    `Thank you — ${data?.eventTitle ?? 'our celebration'}`,
  displayName: 'Thank-you card',
  previewData: {
    eventTitle: "Ron & Ashley's Anniversary Party",
    message:
      "Thank you so much for celebrating with us. Your presence made the night unforgettable.",
    signOff: 'Ron & Ashley',
    gif: 'https://media1.giphy.com/media/hxERQNWQudqSF1iDnr/giphy.gif',
    recipientName: 'Jane',
    pieceUrl: 'https://thekenroecollective.com/sound/example-piece',
    pieceTitle: 'For everyone who came',
    pieceKind: 'letter',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif' }
const container = { padding: '32px 20px', maxWidth: '600px', margin: '0 auto' }
const card = {
  backgroundColor: '#fffaf3',
  borderRadius: '16px',
  padding: '40px 32px',
  border: '1px solid #ebe4d8',
}
const eyebrow = {
  fontSize: '11px',
  letterSpacing: '0.3em',
  textTransform: 'uppercase' as const,
  color: '#8b5a3c',
  margin: '0 0 8px 0',
  fontFamily: 'Arial, sans-serif',
}
const heading = {
  fontSize: '28px',
  lineHeight: '1.2',
  color: '#2a1a0f',
  margin: '0 0 24px 0',
  fontWeight: 'normal' as const,
}
const hero = { borderRadius: '12px', width: '100%', height: 'auto', marginBottom: '24px' }
const greeting = { fontSize: '16px', color: '#2a1a0f', margin: '0 0 12px 0' }
const body = { fontSize: '16px', lineHeight: '1.6', color: '#2a1a0f', whiteSpace: 'pre-wrap' as const, margin: 0 }
const gifStyle = { borderRadius: '12px', maxWidth: '100%', height: 'auto' }
const divider = { borderColor: '#ebe4d8', margin: '28px 0 16px 0' }
const sign = { fontSize: '20px', fontStyle: 'italic' as const, color: '#8b5a3c', margin: 0 }

const pieceBox = {
  marginTop: '28px',
  padding: '20px',
  borderRadius: '12px',
  backgroundColor: '#f6efe4',
  border: '1px solid #e5d9c6',
  textAlign: 'center' as const,
}
const pieceEyebrow = {
  fontSize: '11px',
  letterSpacing: '0.22em',
  textTransform: 'uppercase' as const,
  color: '#8b5a3c',
  margin: '0 0 6px 0',
  fontFamily: 'Arial, sans-serif',
}
const pieceTitleStyle = {
  fontSize: '18px',
  color: '#2a1a0f',
  margin: '0 0 16px 0',
}
const pieceButton = {
  display: 'inline-block',
  backgroundColor: '#8b5a3c',
  color: '#ffffff',
  fontFamily: 'Arial, sans-serif',
  fontSize: '14px',
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '999px',
}
const pieceNote = {
  fontSize: '12px',
  color: '#6b5546',
  margin: '14px 0 0 0',
  fontFamily: 'Arial, sans-serif',
}
