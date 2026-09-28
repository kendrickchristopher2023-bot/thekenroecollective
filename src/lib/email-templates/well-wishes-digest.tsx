import {
  Body,
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

interface Wish {
  name?: string;
  message?: string;
}

interface Props {
  eventTitle?: string;
  wishes?: Wish[];
  /**
   * Event cover art. Letterboxed rather than cropped, and only ever an
   * absolute https URL: the send path strips blob/data/relative URLs, which
   * render in the host's preview and then vanish in the inbox.
   */
  coverImage?: string;
}

const WellWishesDigestEmail = ({
  eventTitle = "your celebration",
  wishes = [],
  coverImage,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`${wishes.length} well ${wishes.length === 1 ? "wish" : "wishes"} from ${eventTitle}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>Well wishes</Text>
        <Section style={card}>
          {coverImage ? (
            <Img src={coverImage} alt={eventTitle} width="512" style={cover} />
          ) : null}
          <Heading style={heading}>Messages just for you</Heading>
          <Text style={intro}>
            {`Guests at ${eventTitle} left ${wishes.length} ${wishes.length === 1 ? "message" : "messages"} for you. Here they are, all in one place.`}
          </Text>

          {wishes.map((w, i) => (
            <Section key={i} style={wishBox}>
              <Text style={wishName}>{w.name || "A guest"}</Text>
              <Text style={wishText}>{w.message || ""}</Text>
            </Section>
          ))}
          <Text style={footer}>Sent with care by The Kenroe Collective.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: WellWishesDigestEmail,
  subject: (data: Record<string, unknown>) =>
    `Well wishes from ${(data?.eventTitle as string) || "your celebration"}`,
  displayName: "Well wishes digest",
  previewData: {
    eventTitle: "Layla turns 40",
    coverImage: "https://thekenroecollective.com/favicon.svg",
    wishes: [
      { name: "Marcus", message: "You light up every room you walk into. Happy birthday." },
      { name: "Nina", message: "Thank you for years of laughter. Here is to many more." },
    ],
  },
} satisfies TemplateEntry;

const main = { backgroundColor: "#ffffff", fontFamily: "Georgia, Times, serif" };
const container = { padding: "28px 24px", maxWidth: "600px" };
// Letterboxed, never cropped: a host's cover art must arrive whole.
const cover = {
  width: "100%",
  maxWidth: "512px",
  height: "auto",
  objectFit: "contain" as const,
  borderRadius: "12px",
  margin: "0 0 18px",
  display: "block",
};

const eyebrow = {
  fontSize: "11px",
  letterSpacing: "2px",
  textTransform: "uppercase" as const,
  color: "#8a6b4f",
  margin: "0 0 12px",
};
const card = {
  border: "1px solid #eee6dc",
  borderRadius: "16px",
  padding: "28px 24px",
  backgroundColor: "#fdfbf8",
};
const heading = { fontSize: "26px", margin: "0 0 12px", color: "#241f1b" };
const intro = { fontSize: "16px", lineHeight: "26px", color: "#4a4038", margin: "0 0 20px" };
const wishBox = {
  borderTop: "1px solid #eee6dc",
  padding: "16px 0 4px",
};
const wishName = {
  fontSize: "13px",
  letterSpacing: "1px",
  textTransform: "uppercase" as const,
  color: "#8a6b4f",
  margin: "0 0 6px",
};
const wishText = { fontSize: "16px", lineHeight: "26px", color: "#241f1b", margin: "0" };
const footer = { fontSize: "13px", color: "#8b8178", margin: "24px 0 0" };
