create or replace function public.get_public_series_events(_event_id text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with anchor as (
    select e.user_id,
           nullif(btrim(coalesce((e.data::jsonb)->>'seriesName','')), '') as series
    from public.events e
    where e.id = _event_id and e.archived_at is null
    limit 1
  )
  select coalesce(jsonb_agg(x order by x->>'date' nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', e.id,
      'title', (e.data::jsonb)->>'title',
      'date', (e.data::jsonb)->>'date',
      'time', (e.data::jsonb)->>'time',
      'timezone', (e.data::jsonb)->>'timezone',
      'venue', (e.data::jsonb)->>'venue',
      'seriesName', (e.data::jsonb)->>'seriesName'
    ) as x
    from public.events e
    join anchor a on true
    where a.series is not null
      and e.user_id = a.user_id
      and e.archived_at is null
      and lower(btrim(coalesce((e.data::jsonb)->>'seriesName',''))) = lower(a.series)
  ) s;
$function$;

grant execute on function public.get_public_series_events(text) to anon, authenticated, service_role;