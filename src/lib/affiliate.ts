// Rewrite known registry/store URLs with The Kenroe Collective affiliate tags.
// Safe no-op for unknown stores. Update tags in one place.

export const AFFILIATE_TAGS = {
  amazon: "kenroes-20",
  // Network slugs / partner ids — placeholders until partner programs are claimed.
  rakuten: "kenroes",
  impact: "kenroes",
  awin: "kenroes",
  cj: "kenroes",
} as const;

/**
 * Returns a URL with affiliate parameters appended for supported stores.
 * Falls back to the original URL on parse errors or unknown hosts.
 */
export function rewriteAffiliate(input: string): string {
  if (!input) return input;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    // Amazon — official tag param
    if (host.endsWith("amazon.com") || host.endsWith("amzn.to")) {
      u.searchParams.set("tag", AFFILIATE_TAGS.amazon);
      return u.toString();
    }

    // Target — Impact network
    if (host.endsWith("target.com")) {
      u.searchParams.set("afid", AFFILIATE_TAGS.impact);
      u.searchParams.set("ref", "tgt_adv_xsf");
      return u.toString();
    }

    // Walmart — Impact / Rakuten
    if (host.endsWith("walmart.com")) {
      u.searchParams.set("affid", AFFILIATE_TAGS.impact);
      return u.toString();
    }

    // Best Buy — Impact
    if (host.endsWith("bestbuy.com")) {
      u.searchParams.set("ref", `${AFFILIATE_TAGS.impact}`);
      u.searchParams.set("loc", "kenroes");
      return u.toString();
    }

    // Etsy — Awin
    if (host.endsWith("etsy.com")) {
      u.searchParams.set("utm_source", "kenroes");
      u.searchParams.set("utm_medium", "affiliate");
      u.searchParams.set("awc", AFFILIATE_TAGS.awin);
      return u.toString();
    }

    // Williams Sonoma / Pottery Barn / Crate & Barrel — CJ
    if (
      host.endsWith("williams-sonoma.com") ||
      host.endsWith("potterybarn.com") ||
      host.endsWith("crateandbarrel.com")
    ) {
      u.searchParams.set("cm_mmc", `cj-_-${AFFILIATE_TAGS.cj}`);
      return u.toString();
    }

    // REI — AvantLink
    if (host.endsWith("rei.com")) {
      u.searchParams.set("avad", AFFILIATE_TAGS.awin);
      return u.toString();
    }

    return input;
  } catch {
    return input;
  }
}

export function isAffiliateEligible(url: string): boolean {
  return rewriteAffiliate(url) !== url;
}
