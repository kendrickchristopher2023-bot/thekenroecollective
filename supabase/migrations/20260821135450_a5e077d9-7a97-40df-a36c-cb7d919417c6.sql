update public.events set data = (data - 'shirtPricingEnabled' - 'shirtPriceAdult' - 'shirtPriceYouth' - 'extraShirtsEnabled' - 'maxExtraShirtsPerRsvp')
  || jsonb_build_object('rsvpDeadline','2026-08-21T13:35:00.000Z')
  || jsonb_build_object('guests', (
    select jsonb_agg(case when g->>'name' = 'Dry Run EmailOnly'
      then (g - 'extraShirts' - 'shirtSize') || jsonb_build_object('plusOnes','[]'::jsonb)
      else g end)
    from jsonb_array_elements(data->'guests') g))
where id='4850qixo';