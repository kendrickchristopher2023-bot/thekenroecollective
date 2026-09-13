INSERT INTO public.events (id, user_id, data)
SELECT 'qa-shirt-1', user_id,
  (data - 'guests' - 'registry')
  || jsonb_build_object(
      'id','qa-shirt-1',
      'title','QA Shirt & Potluck Walkthrough',
      'slug','qa-shirt-1',
      'guests','[]'::jsonb,
      'frame','engraved',
      'paymentEnabled', false,
      'tshirtSizesEnabled', false,
      'shirtPricingEnabled', false,
      'bringSheetEnabled', true,
      'bringSheetAllowSuggestions', true,
      'bringSheetShowNames', true
    )
FROM public.events WHERE id='4850qixo';