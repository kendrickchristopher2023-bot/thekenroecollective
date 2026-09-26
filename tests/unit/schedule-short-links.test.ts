import { describe, expect, it } from "vitest";
import { render } from "@react-email/components";
import { SHORT_CODE_RE, textLinks, spaceLinkPunctuation, EMAIL_RSVP_MARK } from "@/lib/schedule-links";
import { composeScheduleSms, DEFAULT_MANUAL_SMS, renderTemplate, smsSegments } from "@/lib/schedule-messages";
import { template } from "@/lib/email-templates/contact-broadcast";
import { mergeValues, finalSmsBody, scheduleEmailData } from "@/lib/schedules-engine.server";

const TOKEN = "fb293bf39e7f79879003e784e9c780cbf980e11c32bae6ac";
const person = { id: "p1", rsvp_token: TOKEN, short_code: "Kx7mQ2pRtZ", first_sms_sent_at: "2026-01-01", contact: { display_name: "Chris Kendrick" } };
const schedule = { title: "Kendrick Family Reunion Call", timezone: "America/New_York", join_url: "https://zoom.us/j/6286719107", meeting_id: "628 671 9107", meeting_passcode: "121212", description: "Meeting ID: 628 671 9107\nPasscode: 121212", host_name: "Julius Kendrick", host_phone: "+15868238085" };

describe("schedule short links", () => {
  it("accepts only 10-character unambiguous codes", () => {
    expect(SHORT_CODE_RE.test("Kx7mQ2pRtZ")).toBe(true);
    for (const bad of ["Kx7mQ2pRt", "Kx7mQ2pRtZZ", "Kx7mQ0pRtZ", "Kx7mQOpRtZ", "Kx7mQ1pRtZ", "Kx7mQlpRtZ", "Kx7mQIpRtZ", "Kx7mQ-pRtZ"]) expect(SHORT_CODE_RE.test(bad)).toBe(false);
  });

  it("uses short links when a code exists and long links otherwise", () => {
    expect(textLinks(person)).toEqual({ rsvp: "https://thekenroecollective.com/a/Kx7mQ2pRtZ", calendar: "https://thekenroecollective.com/cal/Kx7mQ2pRtZ" });
    expect(textLinks({ rsvp_token: TOKEN }).rsvp).toBe(`https://thekenroecollective.com/sc/${TOKEN}`);
  });

  it("spaces out a period or comma right after a link", () => {
    expect(spaceLinkPunctuation("Tap https://x.com/a/Kx7mQ2pRtZ. Thanks")).toBe("Tap https://x.com/a/Kx7mQ2pRtZ . Thanks");
    expect(spaceLinkPunctuation("See https://x.com/a/abc, or call")).toBe("See https://x.com/a/abc , or call");
    expect(spaceLinkPunctuation("End https://x.com/a/abc.")).toBe("End https://x.com/a/abc .");
    expect(spaceLinkPunctuation("https://zoom.us/j/1.2 ok")).toBe("https://zoom.us/j/1.2 ok");
    expect(spaceLinkPunctuation("No links here. Fine.")).toBe("No links here. Fine.");
  });

  it("the engine renders texts with short links and fewer characters", () => {
    const values = mergeValues(schedule, person, new Date("2026-10-04T20:30:00Z"), "Julius Kendrick");
    const text = finalSmsBody(DEFAULT_MANUAL_SMS + " Confirm: {rsvp}.", values, person, "Julius Kendrick");
    expect(text).toContain("RSVP: https://thekenroecollective.com/a/Kx7mQ2pRtZ");
    expect(text).toContain("Meeting ID: 628 671 9107");
    expect(text).toContain("Passcode: 121212");
    expect(text.match(/Meeting ID:/g)?.length).toBe(1);
    expect(text).toContain("Confirm: https://thekenroecollective.com/a/Kx7mQ2pRtZ .");
    expect(text).not.toContain(TOKEN);
    const long = composeScheduleSms({ title: schedule.title, message: renderTemplate(DEFAULT_MANUAL_SMS, { ...values, rsvp: `https://thekenroecollective.com/sc/${TOKEN}` }), hostLine: values._hostLine, firstText: false });
    const short = finalSmsBody(DEFAULT_MANUAL_SMS, values, person, "Julius Kendrick");
    expect(smsSegments(long).chars - smsSegments(short).chars).toBe(`sc/${TOKEN}`.length - "a/Kx7mQ2pRtZ".length);
    expect(smsSegments(short).segments).toBeLessThanOrEqual(2);
  });

  it("emails show a Will you be there? button and turn {rsvp} into link text", async () => {
    const values = mergeValues(schedule, person, new Date("2026-10-04T20:30:00Z"), "Julius Kendrick");
    const data = scheduleEmailData(schedule, person, values, "Reminder: {title}", "Hi {first_name}, let us know: {rsvp}. Calendar: {calendar}", "Julius Kendrick");
    expect(data.body).toContain(EMAIL_RSVP_MARK);
    const html = await render(template.component(data as any));
    expect(html).toContain("Will you be there?");
    expect(html).toContain("Add to calendar");
    expect(html).toContain("Join the call");
    expect(html).toContain("Meeting ID:");
    expect(html).toContain("628 671 9107");
    expect(html).toContain("Passcode:");
    expect(html).not.toContain(EMAIL_RSVP_MARK);
    expect(html).toContain(`href="https://thekenroecollective.com/sc/${TOKEN}"`);
    expect(html.match(/Will you be there\?/g)!.length).toBe(2);
    expect(html).not.toMatch(/>https:\/\/thekenroecollective\.com\/sc\//);
  });
});
