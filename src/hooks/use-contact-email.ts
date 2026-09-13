import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSiteSettings } from "@/lib/site-settings.functions";

const DEFAULT_EMAIL = "support@thekenroecollective.com";

export function useContactEmail() {
  const fetchSettings = useServerFn(getSiteSettings);
  const [email, setEmail] = useState<string>(DEFAULT_EMAIL);
  useEffect(() => {
    fetchSettings().then((r) => r?.contact_email && setEmail(r.contact_email)).catch(() => {});
  }, [fetchSettings]);
  return email;
}
