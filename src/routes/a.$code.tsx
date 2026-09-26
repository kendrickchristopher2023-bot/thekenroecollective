import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPersonPageByCode } from "@/lib/schedules.functions";
import { SchedulePersonView, PERSON_PAGE_HEAD, PersonNotFound, PersonError } from "@/components/schedule-person-page";
import { SHORT_CODE_RE } from "@/lib/schedule-links";

// Short personal link used in texts: /a/<10-character code> opens the same page as /sc/<token>.
export const Route = createFileRoute("/a/$code")({
  loader: async ({ params }) => {
    if (!SHORT_CODE_RE.test(params.code)) throw notFound();
    const res = await getPersonPageByCode({ data: { code: params.code } });
    if (!res) throw notFound();
    return res;
  },
  head: () => PERSON_PAGE_HEAD,
  component: ShortLinkPage,
  notFoundComponent: PersonNotFound,
  errorComponent: PersonError,
});

function ShortLinkPage() {
  const { page, token } = Route.useLoaderData();
  return <SchedulePersonView page={page} token={token} />;
}
