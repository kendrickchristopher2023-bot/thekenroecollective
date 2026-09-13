-- The live /pricing event tier cards (pricing_tiers.features) had drifted
-- badly from actual enforcement: Postcard/Whisper guest caps were wrong
-- (25 instead of 75/150), Host's blurb said "up to 150 guests" when the
-- real cap is 750, and several features were misattributed (guest import
-- and thank-you cards shown as Host/Whisper-included when they're actually
-- Atelier-free-or-paid-addon-at-Host; voice greeting shown as Host-only
-- when it's Whisper+; day-of toolkit shown as partially available below
-- Atelier when it's fully Atelier-exclusive). Rewrote all four rows to
-- match verified code behavior.
update public.pricing_tiers set features = '["1 active event","Up to 75 guests","Classic invite page","Email invitations included","RSVP tracking","Duplicate this event anytime, free","Branded with The Kenroe Collective","No SMS reminders","No AI invite art or voice greeting","No music / playlist link","No payment collection"]'::jsonb where id = 'postcard';

update public.pricing_tiers set features = '["Up to 3 active events","150 guests per event","Free AI art for your Vibe gallery","Voice greeting","Custom colors, fonts & photos","3 SMS reminders","Guest waitlist","Duplicate this event anytime, free","Unbranded — no Kenroe watermark","Basic PDF export","Photo Wall, guest import & thank-you cards available as add-ons"]'::jsonb where id = 'free';

update public.pricing_tiers set features = '["Everything in Whisper","Up to 10 active events","750 guests per event","Photo Wall included","Vendor marketplace","Gift registry from any store","Per-guest payment collection (Venmo, Zelle, PayPal & more)","AI invite drafting","50 SMS reminders","All exports","Guest import & thank-you cards available as add-ons ($5 / $7)"]'::jsonb where id = 'host';

update public.pricing_tiers set features = '["Everything in Host","Unlimited events & guests","Unlimited SMS reminders","Guest import included","Thank-you cards studio included","Day-of toolkit: seating charts, run-of-show, door check-in","Gift fund collection","Calendar sync","Media Converter tool","AI design studio & AI Polish","Priority support"]'::jsonb where id = 'atelier';

update public.pricing_tiers set blurb = 'For frequent hosts — up to 750 guests, payments, and vendor coordination.' where id = 'host';
