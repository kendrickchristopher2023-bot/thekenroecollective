import { createFileRoute, notFound } from "@tanstack/react-router";
import { getPersonPage } from "@/lib/schedules.functions";
import { SchedulePersonView, PERSON_PAGE_HEAD, PersonNotFound, PersonError } from "@/components/schedule-person-page";

export const Route = createFileRoute("/sc/$token")({
  loader: async ({ params }) => {
    if (!/^[a-f0-9]{48}$/.test(params.token)) throw notFound();
    const page = await getPersonPage({ data: { token: params.token } });
    if (!page) throw notFound();
    return page;
  },
  head: () => PERSON_PAGE_HEAD,
  component: LongLinkPage,
  notFoundComponent: PersonNotFound,
  errorComponent: PersonError,
});

function LongLinkPage() {
  const page = Route.useLoaderData();
  const { token } = Route.useParams();
  return <SchedulePersonView page={page} token={token} />;
}
