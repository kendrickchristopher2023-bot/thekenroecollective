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
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  kind?: string
  title?: string
  body?: string
  link?: string
  appUrl?: string
}

const AdminNotificationEmail = ({
  kind = 'notification',
  title = 'New activity',
  body = '',
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
            <Text style={eyebrow}>The Kenroe Collective • Admin alert</Text>
            <Heading style={heading}>{title}</Heading>
            {body && <Text style={para}>{body}</Text>}
            <Text style={meta}>Event type: {kind}</Text>
            <Link href={href} style={button}>Open in dashboard</Link>
          </Section>
          <Text style={footer}>You're receiving this because you're an admin of The Kenroe Collective.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AdminNotificationEmail,
  subject: (data: Record<string, any>) => `[The Kenroe Collective] ${data?.title || 'New activity'}`,
  displayName: 'Admin notification',
  to: 'support@thekenroecollective.com',
  previewData: {
    kind: 'vendor_created',
    title: 'New vendor profile: Acme Florals',
    body: 'florists • Brooklyn',
    link: '/vendors/acme-florals',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '0 16px' }
const card = { padding: '28px', border: '1px solid #ececec', borderRadius: '14px', backgroundColor: '#fafaf7' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: '#6b6b6b', margin: '0 0 12px' }
const heading = { fontSize: '22px', color: '#111', margin: '0 0 12px', fontFamily: 'Georgia, serif' }
const para = { fontSize: '14px', lineHeight: '1.6', color: '#333', margin: '0 0 12px' }
const meta = { fontSize: '12px', color: '#888', margin: '0 0 18px' }
const button = { display: 'inline-block', backgroundColor: '#3B82F6', color: '#fff', padding: '10px 18px', borderRadius: '999px', fontSize: '13px', textDecoration: 'none' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const }
