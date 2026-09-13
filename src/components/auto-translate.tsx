// Auto-translate visible page text into the user's chosen language via Lovable AI.
//
// Behaviour:
// - Owner UI stays English on admin/owner routes.
// - On guest-facing routes (invites, wall, gift, thank-you, checkin, RFQ bid,
//   public event/design tokens), translations run for everyone including owner
//   so owners can preview what guests see when they pick a language.
// - Non-owner users always see translations on every route.
// - English is a no-op.
// - Results are cached in localStorage keyed by (lang, sha) so repeat visits
//   don't spend AI credits and translation is instant on paint.
//
// The DOM walker replaces text nodes in place; original text is stored on
// the parent element so switching languages restores English before
// retranslating. Inputs, code, pre, script, style and elements marked with
// `data-notranslate` are skipped.
import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useLanguage, type LangCode } from "@/lib/i18n";
import { useIsOwner } from "@/lib/use-is-owner";
import { translateBatch } from "@/lib/translate.functions";


function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const CACHE_PREFIX = "ktrx:";
function cacheGet(lang: string, src: string): string | null {
  try {
    return localStorage.getItem(`${CACHE_PREFIX}${lang}:${hash(src)}`);
  } catch {
    return null;
  }
}
function cacheSet(lang: string, src: string, dst: string) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${lang}:${hash(src)}`, dst);
  } catch {
    /* quota — ignore */
  }
}

const SKIP_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "CODE",
  "PRE",
  "TEXTAREA",
  "INPUT",
  "SELECT",
  "OPTION",
  "NOSCRIPT",
  "SVG",
  "PATH",
]);

function shouldSkip(el: Element | null): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    if (cur.getAttribute && cur.getAttribute("data-notranslate") !== null) return true;
    if (cur.getAttribute && cur.getAttribute("translate") === "no") return true;
    cur = cur.parentElement;
  }
  return false;
}

// Inputs/textareas are controlled components with no text-node children, so
// collectTextNodes never sees their placeholder copy — it lives on the
// element as an attribute, not in the DOM's text-node tree. Walk for it
// separately.
function collectPlaceholderEls(root: ParentNode): HTMLElement[] {
  const els = Array.from(root.querySelectorAll<HTMLElement>("input[placeholder], textarea[placeholder]"));
  return els.filter((el) => {
    if (el.getAttribute("data-notranslate") !== null) return false;
    if (el.getAttribute("translate") === "no") return false;
    const trimmed = (el.getAttribute("placeholder") ?? "").trim();
    if (trimmed.length < 2) return false;
    if (/^[\d\s.,:;/\-+*%$€£¥]+$/.test(trimmed)) return false;
    return true;
  });
}

function collectTextNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const t = node.nodeValue;
      if (!t) return NodeFilter.FILTER_REJECT;
      const trimmed = t.trim();
      if (trimmed.length < 2) return NodeFilter.FILTER_REJECT;
      // Skip pure numbers / URLs / emails.
      if (/^[\d\s.,:;/\-+*%$€£¥]+$/.test(trimmed)) return NodeFilter.FILTER_REJECT;
      if (/^https?:\/\//.test(trimmed) || /^\S+@\S+\.\S+$/.test(trimmed)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (shouldSkip(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

async function translatePage(lang: LangCode) {
  if (lang === "en") {
    // Restore any previously replaced text.
    document.querySelectorAll<HTMLElement>("[data-t-orig]").forEach((el) => {
      const orig = el.getAttribute("data-t-orig");
      if (orig != null && el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
        el.firstChild.nodeValue = orig;
      }
      el.removeAttribute("data-t-orig");
      el.removeAttribute("data-t-lang");
    });
    // Restore any previously replaced placeholders.
    document.querySelectorAll<HTMLElement>("[data-t-orig-ph]").forEach((el) => {
      const orig = el.getAttribute("data-t-orig-ph");
      if (orig != null) el.setAttribute("placeholder", orig);
      el.removeAttribute("data-t-orig-ph");
      el.removeAttribute("data-t-lang-ph");
    });
    return;
  }

  // Unified queue: text nodes and input/textarea placeholders both resolve to
  // a source string + an apply callback, so one batch/cache pass covers both.
  const pending: { src: string; apply: (dst: string) => void }[] = [];

  for (const node of collectTextNodes(document.body)) {
    const original = node.nodeValue ?? "";
    const parent = node.parentElement;
    if (!parent) continue;

    const storedLang = parent.getAttribute("data-t-lang");
    const storedOrig = parent.getAttribute("data-t-orig");
    // Determine the true source (English) text.
    const src = storedOrig ?? original;

    if (storedLang === lang) continue; // already in target language

    const cached = cacheGet(lang, src);
    if (cached) {
      if (!storedOrig) parent.setAttribute("data-t-orig", src);
      parent.setAttribute("data-t-lang", lang);
      node.nodeValue = cached;
      continue;
    }
    pending.push({
      src,
      apply: (dst) => {
        if (!parent.getAttribute("data-t-orig")) parent.setAttribute("data-t-orig", src);
        parent.setAttribute("data-t-lang", lang);
        node.nodeValue = dst;
      },
    });
  }

  for (const el of collectPlaceholderEls(document.body)) {
    const original = el.getAttribute("placeholder") ?? "";
    const storedLang = el.getAttribute("data-t-lang-ph");
    const storedOrig = el.getAttribute("data-t-orig-ph");
    const src = storedOrig ?? original;

    if (storedLang === lang) continue;

    const cached = cacheGet(lang, src);
    if (cached) {
      if (!storedOrig) el.setAttribute("data-t-orig-ph", src);
      el.setAttribute("data-t-lang-ph", lang);
      el.setAttribute("placeholder", cached);
      continue;
    }
    pending.push({
      src,
      apply: (dst) => {
        if (!el.getAttribute("data-t-orig-ph")) el.setAttribute("data-t-orig-ph", src);
        el.setAttribute("data-t-lang-ph", lang);
        el.setAttribute("placeholder", dst);
      },
    });
  }

  if (!pending.length) return;

  // De-duplicate identical strings; batch of 60 per request.
  const uniq = Array.from(new Set(pending.map((p) => p.src)));
  const CHUNK = 60;
  const map = new Map<string, string>();
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    try {
      const { translations } = await translateBatch({
        data: { target: lang, strings: chunk },
      });
      chunk.forEach((src, idx) => {
        const dst = translations[idx] || src;
        map.set(src, dst);
        cacheSet(lang, src, dst);
      });
    } catch (e) {
      console.warn("[auto-translate] batch failed", e);
    }
  }

  for (const { src, apply } of pending) {
    const dst = map.get(src);
    if (!dst) continue;
    apply(dst);
  }
}

export function AutoTranslate() {
  const { lang } = useLanguage();
  const { isOwner, ready } = useIsOwner();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const running = useRef(false);
  const queued = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect the chosen language on <html> so screen readers, search engines,
  // and CSS `:lang()` selectors match, and flip to RTL for Arabic.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!ready) return;
    // Owners get a live preview of their chosen language on every route —
    // they explicitly picked it, so they expect to see the result. Guests
    // are always translated. English is a no-op that restores originals.
    void isOwner;
    void pathname;
    const active = lang !== "en";

    let loaded = document.readyState === "complete";

    const run = async () => {
      // Never rewrite text while the document is still loading/hydrating.
      if (!loaded) return;
      if (running.current) {

        queued.current = true;
        return;
      }
      running.current = true;
      try {
        await translatePage(active ? lang : "en");
      } finally {
        running.current = false;
        if (queued.current) {
          queued.current = false;
          setTimeout(run, 100);
        }
      }
    };

    // Wait for the document to finish loading before rewriting text nodes.
    // Rewriting during hydration made React see text it did not render and
    // report hydration errors (#418/#422/#520) on public pages.
    let t: ReturnType<typeof setTimeout> | undefined;
    let onLoad: (() => void) | undefined;
    const start = () => {
      loaded = true;
      t = setTimeout(run, 60);
    };

    if (document.readyState === "complete") {
      start();
    } else {
      onLoad = () => start();
      window.addEventListener("load", onLoad, { once: true });
    }


    // Re-run on DOM changes (dialogs, async lists).
    const observer = new MutationObserver(() => {
      if (!active) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(run, 250);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: false });

    return () => {
      if (t) clearTimeout(t);
      if (onLoad) window.removeEventListener("load", onLoad);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      observer.disconnect();
    };

  }, [lang, isOwner, ready, pathname]);

  return null;
}
