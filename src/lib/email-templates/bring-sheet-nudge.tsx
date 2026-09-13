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
  guestName?: string
  hostName?: string
  eventTitle?: string
  neededList?: string[]
  summary?: string
  sheetUrl?: string
}

const BringSheetNudgeEmail = ({
  guestName = 'there',
  hostName = '',
  eventTitle = 'the event',
  neededList = [],
  sheetUrl = 'https://thekenroecollective.com',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Still needed for ${eventTitle}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>What to bring</Text>
        <Section style={card}>
          <Heading style={heading}>{eventTitle}</Heading>
          <Text style={greeting}>Hi {guestName},</Text>
          <Text style={message}>
            Thanks for saying yes. A few things are still open on the sign-up sheet, pick whatever
            suits you and we will mark it off the list.
          </Text>
          {neededList.length > 0 && (
            <Section style={listBox}>
              {neededList.slice(0, 20).map((item) => (
                <Text key={item} style={listItem}>
                  • {item}
                </Text>
              ))}
            </Section>
          )}
          <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
            <Link href={sheetUrl} style={primaryButton}>
              Sign up to bring something
            </Link>
          </Section>
          {hostName && (
            <Text style={signoff}>
              Thank you,
              <br />
              {hostName}
            </Text>
          )}
        </Section>
        <Text style={footer}>
          You are receiving this because {hostName || 'your host'} is organising a sign-up sheet for
          this event on The Kenroe Collective. Bringing nothing is fine too, just come hungry.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BringSheetNudgeEmail,
  subject: (data: Record<string, any>) =>
    `Still needed for ${data?.eventTitle || 'the event'}`,
  displayName: 'Sign-up sheet nudge',
  previewData: {
    guestName: 'Alex',
    hostName: 'Christopher',
    eventTitle: "A Summer's Feast",
    neededList: ['Potato salad', 'Brownies (2 more needed)', 'Bag of ice'],
    sheetUrl: 'https://thekenroecollective.com/bring/sample',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '24px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.2' }
const greeting = { fontSize: '15px', color: '#333', margin: '18px 0 10px', fontFamily: 'Arial, sans-serif' }
const message = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const listBox = { backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '12px', padding: '12px 16px', margin: '8px 0 4px' }
const listItem = { fontSize: '14px', lineHeight: '1.6', color: '#333', margin: '2px 0', fontFamily: 'Arial, sans-serif' }
const signoff = { fontSize: '14px', color: '#333', margin: '18px 0 4px', fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
