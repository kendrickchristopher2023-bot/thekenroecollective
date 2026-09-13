import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type Venture = {
  id: string;
  name: string;
  tagline: string;
  href: string;
  cta_label: string;
  is_external: boolean;
  status: string;
  sort_order: number;
  accent: string | null;
  category: string;
  category_order: number;
};

/** Ventures grouped under their category heading, in display order. */
export type VentureCategory = { category: string; ventures: Venture[] };

export function groupVentures(list: Venture[]): VentureCategory[] {
  const ordered = [...list].sort(
    (a, b) => a.category_order - b.category_order || a.sort_order - b.sort_order,
  );
  const groups: VentureCategory[] = [];
  for (const v of ordered) {
    const last = groups[groups.length - 1];
    if (last && last.category === v.category) last.ventures.push(v);
    else groups.push({ category: v.category, ventures: [v] });
  }
  return groups;
}

/**
 * Static fallback so the umbrella splash page never renders an empty list if
 * the database read fails. The table is the source of truth — new ventures are
 * added there, no deploy required.
 */
export const FALLBACK_VENTURES: Venture[] = [
  {
    id: "fallback-events",
    name: "Events & Gatherings",
    tagline:
      "Invitations, RSVPs, vendors, and the whole evening — orchestrated with editorial care.",
    href: "/gatherings",
    cta_label: "Plan an event",
    is_external: false,
    status: "live",
    sort_order: 10,
    accent: "velvet",
    category: "Celebrations",
    category_order: 10,
  },
  {
    id: "fallback-ecards",
    name: "Group eCards",
    tagline:
      "One card, one link, everyone signs it. Kept secret until the day it matters.",
    href: "/ecards",
    cta_label: "Start a card free",
    is_external: false,
    status: "live",
    sort_order: 20,
    accent: "walnut",
    category: "Celebrations",
    category_order: 10,
  },
  {
    id: "fallback-sound",
    name: "Kenroe Sound Studio",
    tagline:
      "An original song or spoken-word piece written for one occasion, with the guests of honour named out loud.",
    href: "/music",
    cta_label: "Preview the studio",
    is_external: false,
    status: "coming_soon",
    sort_order: 25,
    accent: "blossom",
    category: "Celebrations",
    category_order: 10,
  },
  {
    id: "fallback-projects",
    name: "Projects",
    tagline:
      "Kanban boards, tasks, and quiet accountability — for production work of every kind.",
    href: "/workroom",
    cta_label: "Manage projects",
    is_external: false,
    status: "live",
    sort_order: 30,
    accent: "cyprus",
    category: "The Workroom",
    category_order: 20,
  },
  {
    id: "fallback-resume",
    name: "Application Kit",
    tagline: "An AI job-search companion for résumés, letters, and applications that land.",
    href: "https://excel-ai-resume.lovable.app/request-access",
    cta_label: "Request early access",
    is_external: true,
    status: "invite_only",
    sort_order: 40,
    accent: "gold",
    category: "Career",
    category_order: 30,
  },
];


export const listVentures = createServerFn({ method: "GET" }).handler(async (): Promise<Venture[]> => {
  try {
    const sb = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await sb
      .from("ventures")
      .select("id,name,tagline,href,cta_label,is_external,status,sort_order,accent,category,category_order")
      .eq("visible", true)
      .order("category_order").order("sort_order");
    if (error || !data || data.length === 0) return FALLBACK_VENTURES;
    return data as Venture[];
  } catch {
    return FALLBACK_VENTURES;
  }
});
