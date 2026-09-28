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
  deadlineLabel?: string
  daysLeft?: number
  inviteUrl?: string
  /** One-tap answer links so a reminder can be answered from the inbox. */
  rsvpYesUrl?: string
  rsvpMaybeUrl?: string
  rsvpNoUrl?: string
  /** "en" (default) or "es" */
  locale?: string
}

const STRINGS = {
  en: {
    preview: (title: string, deadline: string) =>
      deadline ? `${title} · please reply by ${deadline}` : `${title} · please reply`,
    eyebrow: 'A gentle reminder',
    greet: (n: string) => `Hi ${n},`,
    body: (title: string, deadline: string) =>
      `We're finalizing the guest list for ${title} and haven't heard from you yet. Please respond by ${deadline}.`,
    dueSoon: (d: number) => (d <= 0 ? 'The deadline is today.' : d === 1 ? '1 day left to respond.' : `${d} days left to respond.`),
    cta: 'Respond now',
    prompt: 'Will you join us?',
    yes: 'Joyfully accepts',
    maybe: 'Will try to make it',
    no: 'Regretfully declines',
    oneTap: 'One tap saves your answer. You can add details afterwards.',
    signoff: 'Thank you,',
    footer: (h: string) =>
      `You're receiving this because ${h || 'your host'} added you to the guest list on The Kenroe Collective.`,
    attribution: (h: string, title: string) =>
      `${h || 'Your host'} is organizing ${title} and added you to the guest list.`,
  },
  es: {
    preview: (title: string, deadline: string) =>
      deadline ? `${title} · responde antes del ${deadline}` : `${title} · por favor responde`,
    eyebrow: 'Un recordatorio amable',
    greet: (n: string) => `Hola ${n},`,
    body: (title: string, deadline: string) =>
      `Estamos cerrando la lista de invitados para ${title} y aún no hemos recibido tu respuesta. Por favor responde antes del ${deadline}.`,
    dueSoon: (d: number) => (d <= 0 ? 'La fecha límite es hoy.' : d === 1 ? 'Queda 1 día para responder.' : `Quedan ${d} días para responder.`),
    cta: 'Responder ahora',
    prompt: '¿Podrás asistir?',
    yes: 'Sí, asistiré',
    maybe: 'Quizás',
    no: 'No podré asistir',
    oneTap: 'Un toque guarda tu respuesta. Puedes añadir detalles después.',
    signoff: 'Gracias,',
    footer: (h: string) =>
      `Recibes este correo porque ${h || 'tu anfitrión'} te añadió a la lista de invitados en The Kenroe Collective.`,
    attribution: (h: string, title: string) =>
      `${h || 'Tu anfitrión'} está organizando ${title} y te añadió a la lista de invitados.`,
  },
} as const

const RsvpReminderEmail = ({
  guestName = 'there',
  hostName = '',
  eventTitle = 'the event',
  deadlineLabel = '',
  daysLeft,
  inviteUrl = 'https://thekenroecollective.com',
  rsvpYesUrl,
  rsvpMaybeUrl,
  rsvpNoUrl,
  locale = 'en',
}: Props) => {
  const S = (STRINGS as any)[locale] ?? STRINGS.en
  return (
    <Html lang={locale} dir="ltr">
      <Head />
      <Preview>{S.preview(eventTitle, deadlineLabel)}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Text style={eyebrow}>{S.eyebrow}</Text>
          <Section style={card}>
            <Heading style={heading}>{eventTitle}</Heading>
            <Text style={attribution}>{S.attribution(hostName, eventTitle)}</Text>
            <Text style={greeting}>{S.greet(guestName)}</Text>
            <Text style={messageStyle}>{S.body(eventTitle, deadlineLabel || '—')}</Text>
            {typeof daysLeft === 'number' && (
              <Text style={due}>{S.dueSoon(daysLeft)}</Text>
            )}
            {(rsvpYesUrl || rsvpMaybeUrl || rsvpNoUrl) ? (
              <Section style={answerBlock}>
                <Text style={answerPrompt}>{S.prompt}</Text>
                {rsvpYesUrl && (
                  <Section style={{ textAlign: 'center', margin: '0 0 10px' }}>
                    <Link href={rsvpYesUrl} style={answerButton}>{S.yes}</Link>
                  </Section>
                )}
                {rsvpMaybeUrl && (
                  <Section style={{ textAlign: 'center', margin: '0 0 10px' }}>
                    <Link href={rsvpMaybeUrl} style={answerButtonQuiet}>{S.maybe}</Link>
                  </Section>
                )}
                {rsvpNoUrl && (
                  <Section style={{ textAlign: 'center', margin: '0' }}>
                    <Link href={rsvpNoUrl} style={answerButtonQuiet}>{S.no}</Link>
                  </Section>
                )}
                <Text style={answerNote}>{S.oneTap}</Text>
              </Section>
            ) : (
              <Section style={{ textAlign: 'center', margin: '24px 0 8px' }}>
                <Link href={inviteUrl} style={primaryButton}>
                  {S.cta}
                </Link>
              </Section>
            )}
            {hostName && <Text style={signoff}>{S.signoff}<br />{hostName}</Text>}
          </Section>
          <Text style={footer}>{S.footer(hostName)}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: RsvpReminderEmail,
  subject: (data: Record<string, any>) => {
    const locale = (data?.locale as string) || 'en'
    const title = data?.eventTitle || 'your event'
    return locale === 'es' ? `${title}: por favor confirma tu asistencia` : `${title}: please let us know if you can come`
  },
  displayName: 'RSVP reminder',
  previewData: {
    guestName: 'Alex',
    hostName: 'Christopher',
    eventTitle: "A Summer's Feast",
    deadlineLabel: 'July 20, 2026',
    daysLeft: 5,
    inviteUrl: 'https://thekenroecollective.com/invite/sample?g=demo',
    rsvpYesUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=yes',
    rsvpMaybeUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=maybe',
    rsvpNoUrl: 'https://thekenroecollective.com/invite/sample?g=demo&rsvp=no',
    locale: 'en',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif', padding: '24px 0' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0 16px' }
const eyebrow = { fontSize: '11px', letterSpacing: '0.22em', textTransform: 'uppercase' as const, color: '#8a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerBlock = { margin: '18px 0', padding: '18px 14px', backgroundColor: '#ffffff', border: '1px solid #ececec', borderRadius: '14px' }
const answerPrompt = { fontSize: '18px', fontWeight: 700, color: '#5c1d1d', margin: '0 0 14px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerButton = { display: 'block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '16px 24px', borderRadius: '999px', fontSize: '18px', textDecoration: 'none', fontWeight: 700, textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerButtonQuiet = { display: 'block', border: '2px solid #5c1d1d', color: '#5c1d1d', backgroundColor: '#ffffff', padding: '15px 24px', borderRadius: '999px', fontSize: '17px', textDecoration: 'none', fontWeight: 600, textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const answerNote = { fontSize: '13px', color: '#666', margin: '14px 0 0', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const card = { padding: '32px 28px', border: '1px solid #ececec', borderRadius: '18px', backgroundColor: '#fafaf7' }
const heading = { fontSize: '24px', color: '#1a1a1a', margin: '0 0 12px', textAlign: 'center' as const, fontStyle: 'italic' as const, lineHeight: '1.2' }
const attribution = { fontSize: '13px', lineHeight: '1.6', color: '#5a5a5a', margin: '0 0 4px', padding: '12px 14px', backgroundColor: '#f2ece6', borderRadius: '10px', fontFamily: 'Arial, sans-serif' }
const greeting = { fontSize: '15px', color: '#333', margin: '18px 0 10px', fontFamily: 'Arial, sans-serif' }
const messageStyle = { fontSize: '15px', lineHeight: '1.7', color: '#333', margin: '0 0 12px', fontFamily: 'Arial, sans-serif' }
const due = { fontSize: '13px', color: '#5c1d1d', fontWeight: 700, margin: '0 0 6px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
const signoff = { fontSize: '14px', color: '#333', margin: '18px 0 4px', fontFamily: 'Arial, sans-serif' }
const primaryButton = { display: 'inline-block', backgroundColor: '#5c1d1d', color: '#ffffff', padding: '14px 28px', borderRadius: '999px', fontSize: '15px', textDecoration: 'none', fontWeight: 700, letterSpacing: '0.03em', fontFamily: 'Arial, sans-serif' }
const footer = { fontSize: '11px', color: '#999', marginTop: '20px', textAlign: 'center' as const, fontFamily: 'Arial, sans-serif' }
