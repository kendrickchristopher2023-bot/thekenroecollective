-- Add free "Postcard" tier as the entry-level (truly free) plan.
INSERT INTO public.pricing_tiers (id, name, blurb, price_onetime, price_monthly, price_yearly, features, popular, sort_order, active, category)
VALUES (
  'postcard',
  'Postcard',
  'Free forever — beautiful invites without the card.',
  0, 0, 0,
  '["1 active event","Up to 25 guests","Classic invites","RSVP tracking","1 reminder per event","Branded with Kenroe''s Collective","No payment collection","No AI invite art"]'::jsonb,
  false,
  -1,
  true,
  'events'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  blurb = EXCLUDED.blurb,
  price_onetime = EXCLUDED.price_onetime,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  category = EXCLUDED.category;

-- Make new accounts land on 'postcard' so the free tier has a clear identity.
ALTER TABLE public.profiles ALTER COLUMN tier SET DEFAULT 'postcard';