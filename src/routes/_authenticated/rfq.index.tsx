import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/rfq/")({
  beforeLoad: () => {
    throw redirect({ to: "/vendor-hub", search: { tab: undefined } });
  },
});
