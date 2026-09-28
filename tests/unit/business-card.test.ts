import { describe, expect, it } from "vitest";
import {
  buildVCard,
  displayWebsite,
  formatPhone,
  initials,
  signatureHtml,
  signatureText,
  vCardFilename,
  type BusinessCard,
} from "@/lib/business-card";

const card: BusinessCard = {
  slug: "christopher",
  full_name: "Christopher Kendrick",
  role: "Founder, Events",
  organisation: "The Kenroe Collective",
  email: "concierge@thekenroecollective.com",
  phone: "+19802360667",
  website: "https://thekenroecollective.com",
  photo_url: null,
  show_phone_on_page: false,
  tagline: null,
};

describe("phone and website display", () => {
  it("formats a US number the way it is printed", () => {
    expect(formatPhone("+19802360667")).toBe("1-980-236-0667");
    expect(formatPhone("9802360667")).toBe("980-236-0667");
    expect(formatPhone(null)).toBe("");
  });

  it("drops the scheme from the website", () => {
    expect(displayWebsite("https://thekenroecollective.com/")).toBe("thekenroecollective.com");
  });

  it("makes initials for the monogram fallback", () => {
    expect(initials("Christopher Kendrick")).toBe("CK");
  });
});

describe("the saved contact file", () => {
  const vcf = buildVCard(card, "https://thekenroecollective.com/card/christopher");

  it("is a vCard 3.0 with CRLF line endings, which both iPhone and Android accept", () => {
    expect(vcf.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(vcf.trimEnd().endsWith("END:VCARD")).toBe(true);
  });

  it("carries name, role, company, email and the number", () => {
    expect(vcf).toContain("FN:Christopher Kendrick");
    expect(vcf).toContain("N:Kendrick;Christopher;;;");
    expect(vcf).toContain("ORG:The Kenroe Collective");
    expect(vcf).toContain("TEL;type=CELL;type=VOICE:1-980-236-0667");
    expect(vcf).toContain("EMAIL;type=INTERNET;type=WORK:concierge@thekenroecollective.com");
  });

  it("escapes a comma in the role so the field does not split", () => {
    expect(vcf).toContain("TITLE:Founder\\, Events");
  });

  it("carries the number even when the page keeps it hidden", () => {
    const hidden = buildVCard({ ...card, show_phone_on_page: false }, "x");
    expect(hidden).toContain("1-980-236-0667");
  });

  it("omits the phone line entirely when there is no number", () => {
    expect(buildVCard({ ...card, phone: null }, "x")).not.toContain("TEL");
  });

  it("names the file after the person", () => {
    expect(vCardFilename(card)).toBe("christopher-kendrick.vcf");
  });
});

describe("email signature", () => {
  it("plain text lists the same details", () => {
    const text = signatureText(card);
    expect(text).toContain("Christopher Kendrick");
    expect(text).toContain("1-980-236-0667");
    expect(text).toContain("thekenroecollective.com");
  });

  it("html uses a table and inline styles so Outlook renders it", () => {
    const html = signatureHtml(card, "https://example.com/logo.png");
    expect(html).toContain("<table");
    expect(html).toContain("mailto:concierge@thekenroecollective.com");
    expect(html).not.toContain("class=");
  });
});
