import timeline from "./timeline.json";

export type Caption = { start: number; end: number; text: string };

export const CAPTIONS = Object.fromEntries(
  (["celebrations", "workroom", "application-kit"] as const).map((film) => {
    const prefix = film === "celebrations" ? "c" : film === "workroom" ? "w" : "a";
    return [film, timeline.lines.filter((line) => line.id.startsWith(prefix)).map((line) => ({ start: line.start, end: line.captionEnd, text: line.text }))];
  }),
) as Record<string, Caption[]>;