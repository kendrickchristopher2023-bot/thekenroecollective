DELETE FROM public.event_bring_claims WHERE item_id IN (SELECT id FROM public.event_bring_items WHERE event_id='qa-shirt-1');
DELETE FROM public.event_bring_items WHERE event_id='qa-shirt-1';
DELETE FROM public.events WHERE id='qa-shirt-1';