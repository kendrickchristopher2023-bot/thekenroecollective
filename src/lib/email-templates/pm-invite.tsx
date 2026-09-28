import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface PmInviteProps {
  projectName?: string;
  inviterName?: string;
  role?: string;
  acceptUrl: string;
  siteName?: string;
}

const Email = ({
  projectName = "a project",
  inviterName,
  role = "editor",
  acceptUrl,
  siteName = "The Kenroe Collective",
}: PmInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to collaborate on {projectName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You're invited</Heading>
        <Text style={text}>
          {inviterName ? `${inviterName} has invited you` : "You've been invited"} to
          collaborate on <strong>{projectName}</strong> in {siteName} as a{" "}
          <strong>{role}</strong>.
        </Text>
        <Section style={{ textAlign: "center", margin: "32px 0" }}>
          <Button style={button} href={acceptUrl}>
            Accept invitation
          </Button>
        </Section>
        <Text style={hint}>
          Or paste this link into your browser:
          <br />
          <span style={{ wordBreak: "break-all" }}>{acceptUrl}</span>
        </Text>
        <Text style={footer}>
          This invitation expires in 14 days. If you weren't expecting it, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
);

export const template = {
  component: Email,
  subject: (d: Record<string, any>) =>
    `You're invited to ${d?.projectName ?? "a project"} on The Kenroe Collective`,
  displayName: "Project invitation",
  previewData: {
    projectName: "Summer End",
    inviterName: "Kendrick",
    role: "editor",
    acceptUrl: "https://thekenroecollective.com/projects/accept-invite/example-token",
  },
} satisfies TemplateEntry;

const main: React.CSSProperties = {
  backgroundColor: "#ffffff",
  fontFamily: "Inter, Arial, sans-serif",
  color: "#1a1a1a",
};
const container: React.CSSProperties = { padding: "32px 28px", maxWidth: 560 };
const h1: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: 28,
  margin: "0 0 12px",
};
const text: React.CSSProperties = { fontSize: 15, lineHeight: 1.6, margin: "12px 0" };
const button: React.CSSProperties = {
  backgroundColor: "#6b1e3a",
  color: "#ffffff",
  padding: "12px 22px",
  borderRadius: 999,
  textDecoration: "none",
  fontWeight: 600,
  fontSize: 14,
};
const hint: React.CSSProperties = {
  fontSize: 12,
  color: "#666",
  marginTop: 24,
  lineHeight: 1.5,
};
const footer: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  marginTop: 32,
  borderTop: "1px solid #eee",
  paddingTop: 16,
};
