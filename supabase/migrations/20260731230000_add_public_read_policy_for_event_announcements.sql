-- Guests viewing a public invite page were never able to see event-scoped
-- "in_app" announcements: there was a public SELECT policy for sent
-- all_users broadcasts, but none for sent event-scoped announcements, so RLS
-- silently blocked them regardless of what the app queried for.
create policy "Anyone reads sent event announcements"
on public.announcements
for select
to public
using (status = 'sent'::announcement_status and audience = 'event'::announcement_audience);
