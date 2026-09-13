ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS price_onetime numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_yearly numeric(10,2) NOT NULL DEFAULT 0;

UPDATE public.pricing_tiers SET
  price_onetime = 12.00, price_monthly = 6.00, price_yearly = 54.00,
  blurb = 'One intimate gathering, beautifully done — single-event unlock with 90-day access.',
  features = '["1 event, up to 25 guests", "90-day event access", "Clean, distraction-free interface", "No ads — ever", "Beautiful RSVP tracking", "Classic invite designs", "Email reminders"]'::jsonb,
  updated_at = now()
WHERE id = 'free';

UPDATE public.pricing_tiers SET
  price_onetime = 35.00, price_monthly = 22.00, price_yearly = 198.00,
  blurb = 'Everything you need for a memorable night, up to 150 guests. Pick one-time, monthly, or save 25% yearly.',
  features = '["Unlimited events (monthly/yearly) or one event with 90-day access (one-time)", "Up to 150 guests per event", "Custom colors, fonts & photos", "Voice greeting + vibe gallery", "Gift registry from any store", "Per-guest payment collection (PayPal, Venmo, Zelle, etc.)", "Reminders & auto-save", "AI invite drafting", "Animated thank-you delivery", "Need more than 150? Upgrade to Atelier"]'::jsonb,
  updated_at = now()
WHERE id = 'host';

UPDATE public.pricing_tiers SET
  price_onetime = 89.00, price_monthly = 55.00, price_yearly = 495.00,
  blurb = 'The full studio — for planners, producers, and once-in-a-lifetime affairs. Save 25% yearly.',
  features = '["Everything in Host", "Unlimited guests", "One-time option: single event with 90-day access", "Payment & gift fund collection", "Thank-you cards studio: scheduled sends + GIFs", "Printed thank-yous (printing fees apply)", "Day-of toolkit: seating, run-of-show, check-in", "Branded URL + calendar sync", "Bulk Excel guest import included", "Social share hub & AI drafting", "Priority support"]'::jsonb,
  updated_at = now()
WHERE id = 'atelier';