import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? null;
    if (!user) {
      const here = location.href || location.pathname;
      throw redirect({
        to: "/auth",
        search: here && here !== "/auth" ? { redirect: here } : ({} as any),
      });
    }
    return { user };
  },
  component: () => <Outlet />,
});
