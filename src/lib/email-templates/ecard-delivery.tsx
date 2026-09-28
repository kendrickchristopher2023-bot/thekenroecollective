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

interface Props {
  recipientName?: string
  occasion?: string
  messageCount?: number
  revealUrl?: string
  revealTimeLabel?: string
  /**
   * A few of the actual photos/GIFs left on the card, so the recipient sees
   * what is waiting instead of only a count. Only absolute https URLs survive
   * the send path; anything browser-only is stripped before render.
   */
  previewImages?: string[]
  /** Voice notes and videos cannot play in an inbox, so they are named instead. */
  extraMediaNote?: string
}

const EcardDeliveryEmail = ({
  recipientName = 'there',
  occasion = 'A celebration',
  messageCount = 0,
  revealUrl = 'https://thekenroecollective.com',
  revealTimeLabel = '',
  previewImages = [],
  extraMediaNote = '',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${recipientName}, your group card is ready to open`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>A group card for you</Text>
        <Section style={card}>
          <Heading style={heading}>{`${occasion}, ${recipientName}`}</Heading>
          <Text style={messageStyle}>
            {messageCount > 0
              ? `${messageCount} ${messageCount === 1 ? 'person has' : 'people have'} written something for you, and it has all been kept secret until now.`
              : 'Something has been put together for you, and it is ready to open.'}
          </Text>
          {revealTimeLabel ? (
            <Text style={messageStyle}>{`It unlocked at ${revealTimeLabel}.`}</Text>
          ) : null}
          {previewImages.length > 0 ? (
            <Section style={{ margin: '18px 0 6px' }}>
              {previewImages.slice(0, 3).map((src, i) => (
                <Img
                  key={i}
                  src={src}
                  alt={`A picture left on your card by a well-wisher`}
                  width="512"
                  style={previewImage}
                />
              ))}
            </Section>
          ) : null}
          {extraMediaNote ? <Text style={noteStyle}>{extraMediaNote}</Text> : null}
          <Text style={messageStyle}>
            Open your card whenever you have a quiet minute. The page stays yours to keep.
          </Text>

          <Section style={{ textAlign: 'center', margin: '26px 0 8px' }}>
            <Link href={revealUrl} style={primaryButton}>
              Open your card
            </Link>
          </Section>
        </Section>
        <Text style={footer}>
          Group eCards by The Kenroe Collective. If you were not expecting this, you can safely
          ignore it.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EcardDeliveryEmail,
  subject: (data: Record<string, any>) =>
    `${data?.recipientName || 'You'} have a group card waiting`,
  displayName: 'Group eCard delivery',
  previewData: {
    recipientName: 'Priya',
    occasion: 'Happy Birthday',
    messageCount: 14,
    revealUrl: 'https://thekenroecollective.com/r/sample',
    previewImages: ['https://thekenroecollective.com/favicon.svg'],
    extraMediaNote: 'There are also 2 voice notes and 1 video waiting on the page.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '26px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.2' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
// Letterboxed so a portrait photo or a wide GIF both arrive whole.
const previewImage = { width: '100%', maxWidth: '512px', height: 'auto', objectFit: 'contain' as const, borderRadius: '12px', margin: '0 0 10px', display: 'block' }
const noteStyle = { fontSize: '14px', lineHeight: '1.6', color: '#5c1d1d', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
