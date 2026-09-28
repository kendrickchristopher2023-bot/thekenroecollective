
INSERT INTO public.pricing_tiers (id, name, blurb, price_monthly, price_yearly, price_onetime, features, popular, sort_order, active)
VALUES
  ('pm_solo', 'Studio Solo',
    'A focused workspace for the solo planner — projects, tasks, and clarity.',
    15, 144, 0,
    to_jsonb(ARRAY['1 seat','Up to 5 active projects','Unlimited tasks','2 GB attachments','Attach to events (requires Events plan)']),
    false, 50, true),
  ('pm_studio', 'Studio',
    'A small team, perfectly in sync — everything you need to run client work.',
    45, 432, 0,
    to_jsonb(ARRAY['Up to 5 seats','Unlimited projects','25 GB attachments','Email invitations','Priority support','Attach to events (requires Events plan)']),
    false, 51, true),
  ('studio_collective', 'The Studio Collective',
    'Our flagship pairing — Atelier events with Studio project management. One elegant suite, one bill, 15% off together.',
    93, 894, 0,
    to_jsonb(ARRAY['Everything in Atelier','Everything in Studio','Seamless event ↔ project linking','15% off vs. buying separately','Concierge onboarding']),
    true, 99, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  blurb = EXCLUDED.blurb,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  features = EXCLUDED.features,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active,
  updated_at = now();
