// Lightweight i18n: shared language list, UI dictionary, and a hook that
// persists the preference to profiles.preferred_language.
//
// Uses a module-level store + useSyncExternalStore so every caller of
// useLanguage() shares the same value. Without this, the picker in the nav
// and the AutoTranslate DOM walker each held their own useState copy, and
// changing the picker never told AutoTranslate to re-translate.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LangCode = "en" | "es" | "fr" | "zh" | "hi" | "ar";

export const LANGUAGES: { code: LangCode; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "fr", label: "French", native: "Français" },
  { code: "zh", label: "Mandarin Chinese", native: "中文" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ar", label: "Arabic", native: "العربية" },
];

const CODES = new Set(LANGUAGES.map((l) => l.code));
function isLangCode(v: unknown): v is LangCode {
  return typeof v === "string" && CODES.has(v as LangCode);
}

export function languageLabel(code: string | null | undefined): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l.native : "English";
}

// ---------- shared store ----------
let currentLang: LangCode = "en";
const listeners = new Set<() => void>();
function emit() { for (const l of listeners) l(); }

function setLangInternal(next: LangCode) {
  if (next === currentLang) return;
  currentLang = next;
  emit();
}

// Wire cross-tab sync once, in the browser.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "ux.lang" && isLangCode(e.newValue)) setLangInternal(e.newValue);
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
function getSnapshot(): LangCode { return currentLang; }
function getServerSnapshot(): LangCode { return "en"; }

// Minimal UI dictionary. Add keys as needed; missing keys fall back to English.
type Dict = Record<string, string>;
const DICTS: Record<LangCode, Dict> = {
  en: {
    "pm.projects": "Your Projects",
    "pm.new": "+ New Project",
    "pm.members": "Members",
    "pm.notes": "Project notes",
    "pm.eventIntegration": "Event integration",
    "pm.language": "Language",
    "pm.attachEvent": "Attach to event",
    "pm.openLinkedEvent": "Open linked event →",
    "pm.inviteByEmail": "Invite by email",
    "pm.copyInvite": "Copy invite link",
    "pm.pendingInvites": "Pending invitations",
    "pm.eventsRequired": "Event plan required for linking",
    "pm.eventsUpsell": "Your Workroom keeps working as-is. Linking a project to a gathering is included on the Host and Atelier event plans.",
    "pm.viewPlans": "View plans",
  },
  es: {
    "pm.projects": "Tus Proyectos",
    "pm.new": "+ Nuevo proyecto",
    "pm.members": "Miembros",
    "pm.notes": "Notas del proyecto",
    "pm.eventIntegration": "Integración con eventos",
    "pm.language": "Idioma",
    "pm.attachEvent": "Vincular a un evento",
    "pm.openLinkedEvent": "Abrir evento vinculado →",
    "pm.inviteByEmail": "Invitar por correo",
    "pm.copyInvite": "Copiar enlace de invitación",
    "pm.pendingInvites": "Invitaciones pendientes",
    "pm.eventsRequired": "Se requiere plan de Eventos",
    "pm.eventsUpsell": "Tu Workroom sigue funcionando igual. Vincular un proyecto a un evento se incluye en los planes Host y Atelier.",
    "pm.viewPlans": "Ver planes",
  },
  fr: {
    "pm.projects": "Vos Projets",
    "pm.new": "+ Nouveau projet",
    "pm.members": "Membres",
    "pm.notes": "Notes du projet",
    "pm.eventIntegration": "Intégration aux événements",
    "pm.language": "Langue",
    "pm.attachEvent": "Lier à un événement",
    "pm.openLinkedEvent": "Ouvrir l'événement →",
    "pm.inviteByEmail": "Inviter par e-mail",
    "pm.copyInvite": "Copier le lien d'invitation",
    "pm.pendingInvites": "Invitations en attente",
    "pm.eventsRequired": "Forfait Événements requis",
    "pm.eventsUpsell": "Votre Workroom continue de fonctionner. Lier un projet à un événement est inclus dans les forfaits Host et Atelier.",
    "pm.viewPlans": "Voir les forfaits",
  },
  zh: {
    "pm.projects": "您的项目",
    "pm.new": "+ 新建项目",
    "pm.members": "成员",
    "pm.notes": "项目备注",
    "pm.eventIntegration": "活动整合",
    "pm.language": "语言",
    "pm.attachEvent": "关联活动",
    "pm.openLinkedEvent": "打开关联活动 →",
    "pm.inviteByEmail": "通过邮箱邀请",
    "pm.copyInvite": "复制邀请链接",
    "pm.pendingInvites": "待处理邀请",
    "pm.eventsRequired": "需要活动套餐",
    "pm.eventsUpsell": "你的 Workroom 不受影响。将项目关联到活动包含在 Host 与 Atelier 活动套餐中。",
    "pm.viewPlans": "查看方案",
  },
  hi: {
    "pm.projects": "आपकी परियोजनाएँ",
    "pm.new": "+ नई परियोजना",
    "pm.members": "सदस्य",
    "pm.notes": "परियोजना नोट्स",
    "pm.eventIntegration": "इवेंट एकीकरण",
    "pm.language": "भाषा",
    "pm.attachEvent": "इवेंट से जोड़ें",
    "pm.openLinkedEvent": "जुड़ा इवेंट खोलें →",
    "pm.inviteByEmail": "ईमेल से आमंत्रित करें",
    "pm.copyInvite": "आमंत्रण लिंक कॉपी करें",
    "pm.pendingInvites": "लंबित आमंत्रण",
    "pm.eventsRequired": "इवेंट प्लान आवश्यक",
    "pm.eventsUpsell": "आपका Workroom वैसे ही चलता रहेगा। प्रोजेक्ट को इवेंट से जोड़ना Host और Atelier इवेंट प्लान में शामिल है।",
    "pm.viewPlans": "योजनाएँ देखें",
  },
  ar: {
    "pm.projects": "مشاريعك",
    "pm.new": "+ مشروع جديد",
    "pm.members": "الأعضاء",
    "pm.notes": "ملاحظات المشروع",
    "pm.eventIntegration": "ربط بالفعاليات",
    "pm.language": "اللغة",
    "pm.attachEvent": "ربط بفعالية",
    "pm.openLinkedEvent": "فتح الفعالية المرتبطة ←",
    "pm.inviteByEmail": "دعوة عبر البريد الإلكتروني",
    "pm.copyInvite": "نسخ رابط الدعوة",
    "pm.pendingInvites": "الدعوات المعلّقة",
    "pm.eventsRequired": "يلزم اشتراك الفعاليات",
    "pm.eventsUpsell": "يستمر Workroom كما هو. ربط مشروع بفعالية مُتضمَّن في خطتي Host و Atelier.",
    "pm.viewPlans": "عرض الباقات",
  },
};

export function useLanguage() {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // On first mount in the browser, hydrate the shared store from
  // localStorage / navigator / profile (once).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const saved = localStorage.getItem("ux.lang");
        if (isLangCode(saved)) {
          setLangInternal(saved);
        } else {
          const nav = (navigator.language || "en").toLowerCase().split("-")[0];
          if (isLangCode(nav)) setLangInternal(nav);
        }
      } catch { /* ignore */ }

      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("preferred_language")
        .eq("id", data.user.id)
        .maybeSingle();
      const code = (p as { preferred_language?: string } | null)?.preferred_language;
      if (isLangCode(code)) {
        setLangInternal(code);
        try { localStorage.setItem("ux.lang", code); } catch { /* ignore */ }
      }
    })();
    return () => { alive = false; };
  }, []);

  const setLang = useCallback(async (next: LangCode) => {
    setLangInternal(next);
    if (typeof window !== "undefined") {
      try { localStorage.setItem("ux.lang", next); } catch { /* ignore */ }
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await (supabase as unknown as { from: (t: string) => { update: (v: unknown) => { eq: (c: string, v: string) => Promise<unknown> } } })
        .from("profiles").update({ preferred_language: next }).eq("id", data.user.id);
    }
  }, []);

  const t = useCallback(
    (key: string) => DICTS[lang]?.[key] ?? DICTS.en[key] ?? key,
    [lang],
  );

  return { lang, setLang, t };
}
