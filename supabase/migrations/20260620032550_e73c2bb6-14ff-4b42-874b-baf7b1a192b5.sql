
ALTER TABLE public.pricing_tiers ADD COLUMN IF NOT EXISTS trial_days int NOT NULL DEFAULT 0;

-- Postcard: it's a free single-event tier; show on one-time tab
UPDATE public.pricing_tiers
SET price_monthly = 0, price_yearly = 0, price_onetime = 0, sort_order = -1
WHERE id = 'postcard';

-- PM addon: $5/mo with 14-day trial
UPDATE public.pricing_tiers
SET name = 'Project Management',
    blurb = 'Add to any plan. Boards, tasks, comments, files.',
    price_monthly = 5,
    price_yearly = 48,
    price_onetime = 0,
    trial_days = 14,
    sort_order = 50
WHERE id = 'pm_solo';

-- Team PM tier
UPDATE public.pricing_tiers
SET name = 'Project Management — Team',
    blurb = 'For studios. Unlimited members, roles, attachments.',
    price_monthly = 12,
    price_yearly = 115,
    trial_days = 14,
    sort_order = 51
WHERE id = 'pm_studio';

-- Bundle: Host + PM addon, save $3/mo
UPDATE public.pricing_tiers
SET name = 'Host + Project Management',
    blurb = 'Everything in Host plus the PM addon. Save $3/month.',
    price_monthly = 14,
    price_yearly = 135,
    sort_order = 99
WHERE id = 'studio_collective';

-- Remove-branding one-time addon ($3)
INSERT INTO public.pricing_tiers (id, name, blurb, category, price_monthly, price_yearly, price_onetime, features, popular, sort_order, active)
VALUES (
  'remove_branding_addon',
  'Remove Kenroe''s branding',
  'Hide the "Made with Kenroe''s Collective" watermark and RSVP footer on one event.',
  'addons',
  0, 0, 3,
  '["Removes watermark on invite", "Removes Powered-by footer on RSVP", "Applies to one event"]'::jsonb,
  false,
  10,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  blurb = EXCLUDED.blurb,
  category = EXCLUDED.category,
  price_onetime = EXCLUDED.price_onetime,
  features = EXCLUDED.features,
  active = true;
