// Application Kit metrics feed. Server only, read only.
//
// The Application Kit is a separate app with its own database, so its product
// numbers arrive over a secured HTTP feed instead of from our own tables. The
// feed returns aggregate counts only, with no personal information.

const FEED_URL = "https://excel-ai-resume.lovable.app/api/public/owner/metrics";
const TIMEOUT_MS = 8000;

export type ResumeVentureBlock = {
  available: boolean;
  note: string | null;
  generatedAt: string | null;
  users: { total: number; newInWindow: number; activeInWindow: number };
  plans: { free: number; pro: number; founder: number };
  product: {
    resumesCreated: number;
    tailorSessions: number;
    applicationsLogged: number;
    matchesSaved: number;
  };
  aiUsage: {
    tailor: number;
    coverLetter: number;
    interviewPrep: number;
    linkedin: number;
    referralDm: number;
    parseResume: number;
    chat: number;
  };
};

const UNAVAILABLE_NOTE = "AI Resume metrics are temporarily unreachable.";

function emptyBlock(note: string | null): ResumeVentureBlock {
  return {
    available: false,
    note,
    generatedAt: null,
    users: { total: 0, newInWindow: 0, activeInWindow: 0 },
    plans: { free: 0, pro: 0, founder: 0 },
    product: { resumesCreated: 0, tailorSessions: 0, applicationsLogged: 0, matchesSaved: 0 },
    aiUsage: {
      tailor: 0,
      coverLetter: 0,
      interviewPrep: 0,
      linkedin: 0,
      referralDm: 0,
      parseResume: 0,
      chat: 0,
    },
  };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Loose shape of the feed response, validated field by field below. */
type FeedPayload = {
  generated_at?: unknown;
  users?: Record<string, unknown>;
  plans?: Record<string, unknown>;
  product?: Record<string, unknown>;
  ai_usage?: Record<string, unknown>;
};

/** Reads the Application Kit aggregate feed for one window. Never throws. */
export async function loadResumeMetrics(since: string, until: string): Promise<ResumeVentureBlock> {
  const key = process.env["RESUME_METRICS_KEY"];
  if (!key) {
    return emptyBlock("The AI Resume metrics key is not configured on this server yet.");
  }

  const url = `${FEED_URL}?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return emptyBlock(UNAVAILABLE_NOTE);
    const json = (await res.json()) as FeedPayload;
    return {
      available: true,
      note: null,
      generatedAt: typeof json?.generated_at === "string" ? json.generated_at : null,
      users: {
        total: num(json?.users?.total),
        newInWindow: num(json?.users?.new_in_window),
        activeInWindow: num(json?.users?.active_in_window),
      },
      plans: {
        free: num(json?.plans?.free),
        pro: num(json?.plans?.pro),
        founder: num(json?.plans?.founder),
      },
      product: {
        resumesCreated: num(json?.product?.resumes_created),
        tailorSessions: num(json?.product?.tailor_sessions),
        applicationsLogged: num(json?.product?.applications_logged),
        matchesSaved: num(json?.product?.matches_saved),
      },
      aiUsage: {
        tailor: num(json?.ai_usage?.tailor),
        coverLetter: num(json?.ai_usage?.cover_letter),
        interviewPrep: num(json?.ai_usage?.interview_prep),
        linkedin: num(json?.ai_usage?.linkedin),
        referralDm: num(json?.ai_usage?.referral_dm),
        parseResume: num(json?.ai_usage?.parse_resume),
        chat: num(json?.ai_usage?.chat),
      },
    };
  } catch {
    return emptyBlock(UNAVAILABLE_NOTE);
  } finally {
    clearTimeout(timer);
  }
}
