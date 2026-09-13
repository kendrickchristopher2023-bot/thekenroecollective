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
  amountDue?: string
  amountPaid?: string
  purpose?: string
  payUrl?: string
  /** "en" (default) or "es" */
  locale?: string
}

const STRINGS = {
  en: {
    preview: (title: string) => `Your payment link for ${title}`,
    eyebrow: 'Your payment link',
    greet: (n: string) => `Hi ${n},`,
    body: (title: string, due: string, purpose: string) =>
      `Here's your payment link for ${title}${purpose ? ` (${purpose})` : ''}. Your share is ${due}. Tap below and choose how you'd like to pay.`,
    partial: (paid: string) => `We've already received ${paid}, thank you.`,
    cta: 'Pay now',
    signoff: 'Thank you,',
    footer: (h: string) =>
      `You're receiving this because ${h || 'your host'} is collecting for this event on The Kenroe Collective. Already paid? Just reply and let your host know.`,
  },
  es: {
    preview: (title: string) => `Tu enlace de pago para ${title}`,
    eyebrow: 'Tu enlace de pago',
    greet: (n: string) => `Hola ${n},`,
    body: (title: string, due: string, purpose: string) =>
      `Aquí está tu enlace de pago para ${title}${purpose ? ` (${purpose})` : ''}. Tu parte es ${due}. Toca el botón y elige cómo quieres pagar.`,
    partial: (paid: string) => `Ya recibimos ${paid}, gracias.`,
    cta: 'Pagar ahora',
    signoff: 'Gracias,',
    footer: (h: string) =>
      `Recibes este correo porque ${h || 'tu anfitrión'} está recaudando para este evento en The Kenroe Collective. ¿Ya pagaste? Responde para avisarle.`,
  },
} as const

const PaymentRequestEmail = ({
  guestName = 'there',
  hostName = '',
  eventTitle = 'the event',
  amountDue = '',
  amountPaid = '',
  purpose = '',
  payUrl = 'https://thekenroecollective.com',
  locale = 'en',
}: Props) => {
  const S = (STRINGS as any)[locale] ?? STRINGS.en
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{S.preview(eventTitle)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{S.eyebrow}</Text>
          <Section style={card}>
            <Heading style={heading}>{eventTitle}</Heading>
            <Text style={greeting}>{S.greet(guestName)}</Text>
            <Text style={messageStyle}>{S.body(eventTitle, amountDue || '—', purpose)}</Text>
            {amountPaid ? <Text style={due}>{S.partial(amountPaid)}</Text> : null}
            <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
              <Link href={payUrl} style={primaryButton}>
                {S.cta}
              </Link>
            </Section>
            {hostName && <Text style={signoff}>{S.signoff}<br />{hostName}</Text>}
          </Section>
          <Text style={footer}>{S.footer(hostName)}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: PaymentRequestEmail,
  subject: (data: Record<string, any>) => {
    const locale = (data?.locale as string) || 'en'
    const title = data?.eventTitle || 'your event'
    return locale === 'es'
      ? `Tu enlace de pago para ${title}`
      : `Your payment link for ${title}`
  },
  displayName: 'Payment link',
  previewData: {
    guestName: 'Alex',
    hostName: 'Christopher',
    eventTitle: "A Summer's Feast",
    amountDue: '$75.00',
    amountPaid: '',
    purpose: 'plated dinner & open bar',
    payUrl: 'https://thekenroecollective.com/invite/sample',
    locale: 'en',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '24px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.2' }
const greeting = { fontSize: '15px', color: '#333', margin: '18px 0 10px', fontFamily: 'Arial, sans-serif' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const due = { fontSize: '13px', color: '#5c1d1d', fontWeight: 700, margin: '0 0 6px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const signoff = { fontSize: '14px', color: '#333', margin: '18px 0 4px', fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
