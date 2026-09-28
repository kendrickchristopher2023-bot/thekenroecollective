// Date-only values ("YYYY-MM-DD", for example a Workroom task due date) carry no
// time and no zone. new Date("2026-08-15") parses as UTC midnight, so printing it
// with toLocaleDateString in any negative-offset zone (all of the US) shows the
// PREVIOUS day. These helpers keep a calendar date a calendar date.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "8/15/2026" for a date-only string, with no zone shifting. US format. */
export function formatDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  const m = DATE_ONLY.exec(value.trim());
  if (m) return `${Number(m[2])}/${Number(m[3])}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { timeZone: "UTC" });
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "August 15, 2026" for a date-only string, with no zone shifting. */
export function formatDateOnlyLong(value: string | null | undefined): string {
  if (!value) return "";
  const m = DATE_ONLY.exec(value.trim());
  if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

