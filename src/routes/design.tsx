import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/design")({
  beforeLoad: () => {
    throw redirect({ to: "/studio", search: { tab: "design" }, replace: true });
  },
  component: () => null,
});
