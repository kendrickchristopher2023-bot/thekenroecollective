import { toast } from "sonner";

/**
 * Standardized upload failure toast with retry action.
 * Use anywhere an upload can fail to provide a consistent friendly error UX.
 */
export function uploadFailedToast(retry: () => void | Promise<void>, opts?: { message?: string }) {
  toast.error(opts?.message ?? "Upload failed", {
    description: "Something went wrong. Tap Retry to try again.",
    action: {
      label: "Retry",
      onClick: () => { void retry(); },
    },
    duration: 6000,
  });
}
