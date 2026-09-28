import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/packages")({
  beforeLoad: () => {
    throw redirect({ to: "/studio", search: { tab: "compose" }, replace: true });
  },
  component: () => null,
});
