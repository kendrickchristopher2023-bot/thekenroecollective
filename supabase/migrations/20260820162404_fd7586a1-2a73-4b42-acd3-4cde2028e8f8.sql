-- Remove the QA walk-in rows created while testing the door check-in flow on the
-- demo event, so the demo guest list is clean again.
UPDATE public.events
SET data = jsonb_set(
  jsonb_set(
    data,
    '{guests}',
    coalesce((
      SELECT jsonb_agg(g)
      FROM jsonb_array_elements(coalesce(data->'guests','[]'::jsonb)) g
      WHERE (g->>'name') NOT IN ('QA Walkin Good','Playwright Walkin','Playwright Walkin 2')
    ), '[]'::jsonb)
  ),
  '{checkIns}',
  coalesce((
    SELECT jsonb_agg(c)
    FROM jsonb_array_elements(coalesce(data->'checkIns','[]'::jsonb)) c
    WHERE (c->>'guestId') NOT LIKE 'walkin-%'
  ), '[]'::jsonb)
)
WHERE id = 'demo-evt-supper';