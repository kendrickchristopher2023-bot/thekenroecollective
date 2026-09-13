DELETE FROM public.pricing_tiers WHERE id = 'remove_branding_addon';
-- Host yearly = $109 (rounded, ~24% off monthly $9 x 12 = $108)
UPDATE public.pricing_tiers SET price_yearly = 109 WHERE id = 'host';
