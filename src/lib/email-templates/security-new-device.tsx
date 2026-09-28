import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Link,
  Hr,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  displayName?: string
  userAgent?: string
  when?: string
  appUrl?: string
}

const SecurityNewDeviceEmail = ({
  displayName = 'there',
  userAgent = 'a new device',
  when = new Date().toUTCString(),
  appUrl = 'https://thekenroecollective.com',
}: Props) => {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>New sign-in to your Kenroe Collective account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Text style={eyebrow}>The Kenroe Collective • Security</Text>
            <Heading style={heading}>New sign-in to your account</Heading>
            <Text style={para}>Hi {displayName},</Text>
            <Text style={para}>
              We noticed a sign-in from a device we haven't seen before on your Kenroe Collective account.
            </Text>
            <Section style={meta}>
              <Text style={metaLine}><strong>When:</strong> {when}</Text>
              <Text style={metaLine}><strong>Device:</strong> {userAgent}</Text>
            </Section>
            <Text style={para}>
              If this was you, no action is needed.
            </Text>
            <Text style={para}>
              If you don't recognize this activity, reset your password immediately and review your recent activity.
            </Text>
            <Link href={`${appUrl}/auth?mode=reset`} style={button}>Reset password</Link>
            <Hr style={hr} />
            <Text style={footer}>
              You're receiving this because a new device signed into your Kenroe Collective account.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: SecurityNewDeviceEmail,
  subject: 'New sign-in to your Kenroe Collective account',
  displayName: 'Security: new device sign-in',
  previewData: {
    displayName: 'Alex',
    userAgent: 'Chrome 128 on macOS',
    when: new Date().toUTCString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const card = { padding: '28px', border: '1px solid #ececec', borderRadius: '14px', backgroundColor: '#fafaf7' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#6b6b6b', margin: '0 0 12px' }
const heading = { fontSize: '22px', color: '#111', margin: '0 0 12px', fontFamily: 'Georgia, serif' }
const para = { fontSize: '14px', lineHeight: '1.6', color: '#333', margin: '0 0 12px' }
const meta = { padding: '12px 14px', border: '1px solid #ececec', borderRadius: '10px', backgroundColor: '#fff', margin: '12px 0 18px' }
const metaLine = { fontSize: '13px', color: '#333', margin: '2px 0' }
const button = { display: 'inline-block', backgroundColor: '#3B82F6', color: '#fff', padding: '10px 18px', borderRadius: '999px', fontSize: '13px', textDecoration: 'none' }
const hr = { borderColor: '#ececec', margin: '20px 0 12px' }
const footer = { fontSize: '11px', color: '#999', textAlign: 'center' as const }
