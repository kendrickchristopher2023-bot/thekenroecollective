import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

/**
 * Event countdown reminder — "your event is coming up".
 *
 * This is the nudge that goes to people who ALREADY have the invitation: the
 * details again, the zone-labelled time, and a link back to the invitation in
 * case they need to change their answer. Time strings arrive pre-formatted, so
 * this template never formats a date or a number itself.
 */
interface Props {
  guestName?: string;
  hostName?: string;
  eventTitle?: string;
  /** "in 1 week", "tomorrow", "today" — computed by the caller. */
  whenLabel?: string;
  eventDate?: string;
  eventTime?: string;
  venue?: string;
  address?: string;
  inviteUrl?: string;
  status?: string;
  accentColor?: string;
  /** Absolute https event cover. Unsafe URLs are stripped on the send path. */
  coverImage?: string;
}

const Email = ({
  guestName,
  hostName,
  eventTitle,
  whenLabel,
  eventDate,
  eventTime,
  venue,
  address,
  inviteUrl,
  status,
  accentColor,
  coverImage,
}: Props) => {
  const accent = accentColor && /^#[0-9a-fA-F]{3,8}$/.test(accentColor) ? accentColor : "#7C2D3A";
  const title = eventTitle || "your event";
  const pending = status !== "yes" && status !== "maybe" && status !== "no";
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{`${title} is ${whenLabel || "coming up"}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {coverImage ? (
            <Img src={coverImage} alt={title} width="512" style={cover} />
          ) : null}
          <Text style={eyebrow}>A friendly reminder</Text>
          <Heading style={h1}>{`${title} is ${whenLabel || "coming up"}`}</Heading>
          <Text style={text}>{guestName ? `Hi ${guestName},` : "Hi there,"}</Text>
          <Text style={text}>
            {pending
              ? `${hostName || "Your host"} still hasn't heard from you about ${title}. Here are the details one more time.`
              : `Here are the details for ${title} so everything is in one place.`}
          </Text>

          <Section style={{ ...card, borderLeft: `3px solid ${accent}` }}>
            {eventDate ? <Text style={cardLine}>{eventDate}</Text> : null}
            {eventTime ? <Text style={cardLine}>{eventTime}</Text> : null}
            {venue ? <Text style={cardLine}>{venue}</Text> : null}
            {address ? <Text style={cardMuted}>{address}</Text> : null}
          </Section>

          {inviteUrl ? (
            <Section style={{ textAlign: "center", margin: "24px 0" }}>
              <Button href={inviteUrl} style={{ ...button, backgroundColor: accent }}>
                {pending ? "Reply now" : "View the invitation"}
              </Button>
            </Section>
          ) : null}

          <Text style={muted}>
            {pending
              ? "One tap on the invitation saves your answer."
              : "Need to change your answer? You can update it on the invitation at any time."}
          </Text>
          <Text style={muted}>
            {`You're receiving this because ${hostName || "your host"} added you to the guest list on The Kenroe Collective.`}
          </Text>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `${d.eventTitle || "Your event"} is ${d.whenLabel || "coming up"}`,
  displayName: "Event reminder",
  previewData: {
    guestName: "Cameron",
    hostName: "Christopher Kendrick",
    eventTitle: "Tenia's Birthday Dinner",
    whenLabel: "today",
    eventDate: "Saturday, August 29, 2026",
    eventTime: "6:00 PM EDT",
    venue: "The Long Table",
    address: "12 Market Street, Philadelphia, PA",
    inviteUrl: "https://thekenroecollective.com/invite/demo?g=g_1",
    status: "yes",
    accentColor: "#7C2D3A",
    coverImage: "",
  },
} satisfies TemplateEntry;

const cover = {
  width: "100%",
  maxWidth: "512px",
  maxHeight: "260px",
  // Never crop the host's image: letterbox it instead of forcing a fill.
  objectFit: "contain" as const,
  borderRadius: "10px",
  margin: "0 0 18px",
};
const main = { backgroundColor: "#ffffff", fontFamily: "Georgia, 'Times New Roman', serif" };
const container = { padding: "28px 24px", maxWidth: "560px" };
const eyebrow = {
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  color: "#8a8178",
  margin: "0 0 8px",
};
const h1 = { fontSize: "24px", lineHeight: "1.3", color: "#231f1c", margin: "0 0 16px" };
const text = { fontSize: "16px", lineHeight: "1.6", color: "#3b3531", margin: "0 0 12px" };
const card = { backgroundColor: "#faf7f4", padding: "16px 18px", borderRadius: "10px", margin: "18px 0" };
const cardLine = { fontSize: "16px", lineHeight: "1.5", color: "#231f1c", margin: "0 0 4px" };
const cardMuted = { fontSize: "14px", lineHeight: "1.5", color: "#6b6259", margin: "0" };
const button = {
  color: "#ffffff",
  borderRadius: "999px",
  padding: "12px 26px",
  fontSize: "15px",
  textDecoration: "none",
};
const muted = { fontSize: "12px", lineHeight: "1.6", color: "#8a8178", margin: "0 0 6px" };
