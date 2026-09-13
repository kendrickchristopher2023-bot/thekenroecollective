import { describe, it, expect } from "vitest";
import {
  lookupGuest,
  maskEmail,
  maskPhone,
  maskName,
  withinOneEdit,
  normalizeText,
} from "@/lib/guest-lookup";

const guests = [
  { id: "1", name: "Wren Alvarez", email: "wren.alvarez@example.com", phone: "+1 415 555 1234" },
  { id: "2", name: "Malik Osei", email: "malik@example.com", phone: "" },
  { id: "3", name: "Delphine Roy", email: "", phone: "2125550099" },
  { id: "4", name: "Christopher Kendrick", email: "chris.k@example.com", phone: "" },
  { id: "5", name: "Christina Kendrick", email: "christina.k@example.com", phone: "" },
];

describe("lookupGuest", () => {
  it("matches exact email, full name and phone", () => {
    expect(lookupGuest(guests, "wren.alvarez@example.com")).toMatchObject({ kind: "match" });
    expect(lookupGuest(guests, "  Malik Osei ")).toMatchObject({ kind: "match" });
    expect(lookupGuest(guests, "5550099")).toMatchObject({ kind: "match" });
  });

  it("matches a unique whole name token", () => {
    const r = lookupGuest(guests, "Alvarez");
    expect(r).toMatchObject({ kind: "match" });
    if (r.kind === "match") expect(r.guest.id).toBe("1");
  });

  it("matches prefixes", () => {
    const r = lookupGuest(guests, "Wre");
    expect(r.kind).toBe("match");
    const partial = lookupGuest(guests, "Malik Ose");
    expect(partial.kind).toBe("match");
  });

  it("tolerates a one-character typo", () => {
    expect(lookupGuest(guests, "Delphin Ro").kind).toBe("match");
    expect(lookupGuest(guests, "Malick").kind).toBe("match");
  });

  it("returns candidates instead of guessing between people", () => {
    const r = lookupGuest(guests, "Chris");
    expect(r.kind).toBe("candidates");
    if (r.kind === "candidates") expect(r.guests.map((g) => g.id).sort()).toEqual(["4", "5"]);
  });

  it("still resolves once the guest gives more", () => {
    const r = lookupGuest(guests, "Christopher");
    expect(r).toMatchObject({ kind: "match" });
    if (r.kind === "match") expect(r.guest.id).toBe("4");
  });

  it("reports empty and unknown input", () => {
    expect(lookupGuest(guests, "   ").kind).toBe("empty");
    expect(lookupGuest(guests, "Zebediah Nobody").kind).toBe("none");
  });

  it("asks for more when too many people match", () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `x${i}`, name: `Sam Test${i}` }));
    expect(lookupGuest(many, "Sam").kind).toBe("too_many");
  });

  it("normalizes accents and punctuation", () => {
    expect(normalizeText("Renée O’Brien")).toBe("renee obrien");
    expect(lookupGuest([{ id: "a", name: "Renée O’Brien" }], "renee obrien").kind).toBe("match");
  });
});

describe("masking", () => {
  it("masks emails, phones and names", () => {
    expect(maskEmail("wren.alvarez@example.com")).toBe("w***z@example.com");
    expect(maskEmail("")).toBe("");
    expect(maskPhone("+1 (415) 555-1234")).toBe("(***) ***-1234");
    expect(maskPhone("12")).toBe("");
    expect(maskName("Wren Alvarez")).toBe("Wren A.");
    expect(maskName("")).toBe("Guest");
  });
});

describe("withinOneEdit", () => {
  it("accepts one edit and rejects two", () => {
    expect(withinOneEdit("wren", "wren")).toBe(true);
    expect(withinOneEdit("wren", "wran")).toBe(true);
    expect(withinOneEdit("wren", "wen")).toBe(true);
    expect(withinOneEdit("wren", "wan")).toBe(false);
  });
});

describe("duplicate exact matches", () => {
  const dupes = [
    { id: "a", name: "Tanya Mensah", email: "t1@example.test" },
    { id: "b", name: "Tanya Mensah", email: "t2@example.test" },
  ];

  it("returns candidates instead of silently picking the first identical name", () => {
    const r = lookupGuest(dupes, "Tanya Mensah");
    expect(r.kind).toBe("candidates");
    if (r.kind === "candidates") expect(r.guests).toHaveLength(2);
  });

  it("returns candidates when two guests share an email", () => {
    const shared = [
      { id: "a", name: "Ray Kendrick", email: "family@example.test" },
      { id: "b", name: "Ada Kendrick", email: "family@example.test" },
    ];
    expect(lookupGuest(shared, "family@example.test").kind).toBe("candidates");
  });

  it("still matches a unique exact name", () => {
    expect(lookupGuest([...dupes, { id: "c", name: "Rosa Fairley" }], "Rosa Fairley").kind).toBe("match");
  });
});
