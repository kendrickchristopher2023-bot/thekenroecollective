CREATE OR REPLACE FUNCTION public.get_public_bring_sheet(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ev jsonb;
  show_names boolean;
  items jsonb;
  dietary_count int := 0;
  access_count int := 0;
BEGIN
  SELECT data INTO ev FROM public.events WHERE id = _event_id AND archived_at IS NULL;
  IF ev IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  show_names := coalesce((ev->>'bringSheetShowNames')::boolean, true);

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'name', i.name,
    'note', i.note,
    'category', i.category,
    'slotsNeeded', i.slots_needed,
    'serves', i.serves,
    'suggested', i.suggested_by_guest,
    'claims', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', CASE WHEN show_names THEN c.name ELSE NULL END,
        'dish', c.dish,
        'note', c.note,
        'createdAt', c.created_at
      ) ORDER BY c.created_at), '[]'::jsonb)
      FROM public.event_bring_claims c WHERE c.item_id = i.id
    )
  ) ORDER BY i.position, i.created_at), '[]'::jsonb)
  INTO items
  FROM public.event_bring_items i
  WHERE i.event_id = _event_id;

  -- Counts only, never names or note text: enough for someone cooking to know
  -- "3 guests noted dietary restrictions" without exposing anyone's details.
  SELECT
    count(*) FILTER (WHERE length(btrim(coalesce(g.value->>'dietary', ''))) > 0),
    count(*) FILTER (WHERE length(btrim(coalesce(g.value->>'accessibility', ''))) > 0)
  INTO dietary_count, access_count
  FROM jsonb_array_elements(coalesce(ev->'guests', '[]'::jsonb)) g;

  RETURN jsonb_build_object(
    'found', true,
    'eventTitle', ev->>'title',
    'enabled', coalesce((ev->>'bringSheetEnabled')::boolean, false),
    'allowSuggestions', coalesce((ev->>'bringSheetAllowSuggestions')::boolean, true),
    'showNames', show_names,
    'dietaryCount', coalesce(dietary_count, 0),
    'accessibilityCount', coalesce(access_count, 0),
    'items', items
  );
END;
$$;
