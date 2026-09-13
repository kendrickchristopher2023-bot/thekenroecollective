ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS thank_you_cards_enabled boolean NOT NULL DEFAULT false;

UPDATE public.pricing_tiers SET
  blurb = 'A first taste — for your most intimate gathering.',
  features = '["1 event","Up to 25 guests","Beautiful RSVP tracking","Classic invite designs","Email reminders"]'::jsonb,
  updated_at = now()
WHERE id = 'free';

UPDATE public.pricing_tiers SET
  name = 'Host',
  blurb = 'Everything you need for a memorable night, up to 150 guests.',
  features = '["Unlimited events","Up to 150 guests per event","Custom colors, fonts & photos","Voice greeting + vibe gallery","Gift registry from any store","Reminders & auto-save","Digital thank-you cards (add-on)","Need more than 150? Upgrade to Atelier"]'::jsonb,
  updated_at = now()
WHERE id = 'host';

UPDATE public.pricing_tiers SET
  name = 'Atelier',
  blurb = 'The full studio — for planners, producers, and once-in-a-lifetime affairs.',
  features = '["Everything in Host","Unlimited guests","Payment & gift fund collection","Thank-you cards: scheduled sends + GIFs","Printed thank-yous (printing fees apply)","Day-of toolkit: seating, run-of-show, check-in","Branded URL + calendar sync","Social share hub & AI drafting","Priority support"]'::jsonb,
  updated_at = now()
WHERE id = 'atelier';