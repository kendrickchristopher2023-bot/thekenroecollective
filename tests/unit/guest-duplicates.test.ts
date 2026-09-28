import { describe, expect, it } from "vitest";
import { findDuplicateGuest, describeDuplicate } from "@/lib/guest-duplicates";

const list = [
  { id: "1", name: "Quinton Kendrick", email: "quinton@example.com", phone: "+1 (404) 555-0123" },
  { id: "2", name: "Monica Kendrick", email: "", phone: "" },
];

describe("findDuplicateGuest", () => {
  it("matches on email regardless of case and spacing", () => {
    const m = findDuplicateGuest(list, { name: "Q Kendrick", email: " QUINTON@Example.com " });
    expect(m?.guest.id).toBe("1");
    expect(m?.reason).toBe("email");
    expect(m?.exact).toBe(true);
  });

  it("matches on phone digits ignoring formatting and country code", () => {
    const m = findDuplicateGuest(list, { name: "Someone Else", phone: "4045550123" });
    expect(m?.reason).toBe("phone");
  });

  it("matches the same name in either order", () => {
    expect(findDuplicateGuest(list, { name: "kendrick, monica" })?.reason).toBe("name");
  });

  it("flags a one-typo name as a soft match", () => {
    const m = findDuplicateGuest(list, { name: "Monika Kendrick" });
    expect(m?.reason).toBe("similar_name");
    expect(m?.exact).toBe(false);
  });

  it("returns null for a genuinely new guest", () => {
    expect(findDuplicateGuest(list, { name: "Trevor Greer", email: "t@example.com" })).toBeNull();
  });

  it("ignores the row being edited", () => {
    expect(
      findDuplicateGuest(list, { name: "Quinton Kendrick" }, { ignoreId: "1" }),
    ).toBeNull();
  });

  it("explains the match in plain language", () => {
    const m = findDuplicateGuest(list, { email: "quinton@example.com" })!;
    expect(describeDuplicate(m)).toBe(
      "Quinton Kendrick is already on this list with same email address.",
    );
  });
});
