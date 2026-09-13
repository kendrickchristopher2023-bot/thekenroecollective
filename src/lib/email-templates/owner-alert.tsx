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
  kind?: string
  title?: string
  lines?: string[]
  link?: string
  appUrl?: string
}

const OwnerAlertEmail = ({
  kind = 'activity',
  title = 'New activity',
  lines = [],
  link,
  appUrl = 'https://thekenroecollective.com',
}: Props) => {
  const href = link ? (link.startsWith('http') ? link : `${appUrl}${link}`) : appUrl
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Text style={eyebrow}>The Kenroe Collective • Owner alert</Text>
            <Heading style={heading}>{title}</Heading>
            {(lines ?? []).map((line, i) => (
              <Text key={i} style={para}>
                {line}
              </Text>
            ))}
            <Text style={meta}>Alert type: {kind}</Text>
            <Link href={href} style={button}>
              Open dashboard
            </Link>
          </Section>
          <Text style={footer}>
            You are receiving this because you are the owner of The Kenroe Collective.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: OwnerAlertEmail,
  subject: (data: Record<string, any>) =>
    `[The Kenroe Collective] ${data?.title || 'New activity'}`,
  displayName: 'Owner alert',
  previewData: {
    kind: 'payment_received',
    title: 'Payment received: $3.99',
    lines: ['Group eCards send fee', 'Card: Congratulations for Layla'],
    link: '/owner',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#111111' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px 16px' }
const card = {
  padding: '28px',
  border: '1px solid #ececec',
  borderRadius: '14px',
  backgroundColor: '#fafaf7',
}
const eyebrow = {
  margin: '0 0 12px',
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase' as const,
  color: '#6b6b6b',
}
const heading = { margin: '0 0 12px', fontSize: '22px', lineHeight: 1.25, color: '#111111' }
const para = { margin: '0 0 8px', fontSize: '15px', lineHeight: 1.6, color: '#333333' }
const meta = { margin: '14px 0 18px', fontSize: '13px', color: '#6b6b6b' }
const button = {
  display: 'inline-block',
  backgroundColor: '#5B3A29',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '999px',
  fontSize: '13px',
  textDecoration: 'none',
}
const footer = { marginTop: '20px', textAlign: 'center' as const, fontSize: '11px', color: '#999999' }
