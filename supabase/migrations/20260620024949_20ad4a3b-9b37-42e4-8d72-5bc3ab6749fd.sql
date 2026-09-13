UPDATE public.pricing_tiers SET price_onetime = 7, price_monthly = 5, price_yearly = 39, updated_at = now() WHERE id = 'free';
UPDATE public.pricing_tiers SET price_onetime = 0, price_monthly = 12, price_yearly = 99, updated_at = now() WHERE id = 'host';
UPDATE public.pricing_tiers SET price_onetime = 0, price_monthly = 29, price_yearly = 249, updated_at = now() WHERE id = 'atelier';