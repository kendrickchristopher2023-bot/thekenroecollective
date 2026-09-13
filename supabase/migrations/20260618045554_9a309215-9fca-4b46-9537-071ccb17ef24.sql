UPDATE public.pricing_tiers
SET features = '["Unlimited events","Up to 150 guests per event","Custom colors, fonts & photos","Voice greeting + vibe gallery","Gift registry from any store","Per-guest payment collection (PayPal, Venmo, Zelle, etc.)","Reminders & auto-save","Digital thank-you cards (add-on)","Need more than 150? Upgrade to Atelier"]'::jsonb
WHERE id = 'host';