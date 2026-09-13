/**
 * Shared primitives for the owner/admin console tables: CSV export that always
 * reflects the current filters, and page-math helpers so every list view shows
 * the same "showing X to Y of Z" language.
 */

export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

export function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function exportCsv<T>(filename: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadCsv(filename, buildCsv(rows, columns));
}

/** Filename stem such as `kenroe-events-2026-08-21`. */
export function csvFileStem(kind: string, suffix?: string): string {
  const day = new Date().toISOString().slice(0, 10);
  const extra = (suffix ?? "").replace(/[^0-9A-Za-z]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `kenroe-${kind}${extra ? `-${extra}` : ""}-${day}`;
}

export type PageMath = {
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
};

export function pageMath(total: number, offset: number, limit: number): PageMath {
  const safeLimit = Math.max(1, limit);
  const pageCount = Math.max(1, Math.ceil(total / safeLimit));
  const page = Math.min(pageCount, Math.floor(offset / safeLimit) + 1);
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(total, offset + safeLimit);
  return {
    page,
    pageCount,
    from,
    to,
    total,
    canPrev: offset > 0,
    canNext: offset + safeLimit < total,
  };
}

export function pageLabel(m: PageMath, noun = "rows"): string {
  if (m.total === 0) return `No ${noun}`;
  return `Showing ${m.from.toLocaleString()} to ${m.to.toLocaleString()} of ${m.total.toLocaleString()} ${noun}`;
}
