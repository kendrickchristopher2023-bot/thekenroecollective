import { createFileRoute, Navigate } from "@tanstack/react-router";

// Short-link redirect for SMS/QR use: /s/<token> -> /invite/<token>.
// Today the token is simply the (already short, 6-8 char) event id.
// If a longer opaque token is introduced later, resolve it server-side here.
export const Route = createFileRoute("/s/$token")({
  component: ShortLinkRedirect,
  // Public route: no auth, no loader (loader would need a session for auth-gated
  // server fns). The invite page itself is public.
  head: () => ({
    meta: [
      { title: "Opening invite…" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function ShortLinkRedirect() {
  const { token } = Route.useParams();
  return <Navigate to="/invite/$eventId" params={{ eventId: token }} replace />;
}
