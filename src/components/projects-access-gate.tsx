import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n";
import { getEntitlements } from "@/lib/entitlements-client";
import { usePreviewTier } from "@/lib/preview-tier";

/**
 * Access hook for the Projects venture (The Workroom).
 *
 * Projects is a standalone paid add-on for every tier — it does NOT require an
 * Events subscription. This hook returns whether the account may use Projects
 * at all. Attaching a project to an event is a separate, tier-gated capability
 * (Host/Atelier) checked at the call site.
 */
export function useProjectsAccess() {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const previewTier = usePreviewTier();

  useEffect(() => {
    let active = true;
    getEntitlements()
      .then((ent) => {
        if (!active) return;
        setHasAccess((ent.isOwner && !ent.previewing) || ent.hasProjectManagement);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setHasAccess(false);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [previewTier]);

  return { loading, hasAccess };
}

/**
 * Shown when someone tries to attach a project to an event without the
 * Host/Atelier plan that unlocks event linking. Projects itself keeps working
 * — this is about the optional events integration only, so the copy must not
 * imply Projects requires Events.
 */
export function EventLinkingUpgradeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-paper p-8 shadow-2xl ring-1 ring-ink/10">
        <p className="text-[10px] uppercase tracking-[0.25em] text-velvet">
          Optional add-on capability
        </p>
        <h2 className="mt-3 font-serif text-2xl">Linking projects to events</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Your Workroom works exactly as it does now — nothing here is locked. Attaching a
          project to one of your gatherings, so the two cross-link, is included on the Host
          and Atelier event plans.
        </p>
        <div className="mt-6 rounded-xl bg-secondary/40 p-4 text-sm">
          <p className="font-medium">Only if you run events too</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Plenty of people use Projects on its own and never need this. Skip it without
            missing anything in the Workroom.
          </p>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:text-ink"
          >
            Not now
          </button>
          <Link
            to="/pricing"
            search={{ category: "projects" }}
            onClick={onClose}
            className="rounded-full bg-velvet px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {t("pm.viewPlans")}
          </Link>
        </div>
      </div>
    </div>
  );
}
