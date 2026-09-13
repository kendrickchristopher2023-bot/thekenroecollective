
UPDATE public.pricing_tiers
SET features = '["Everything in Whisper","Unlimited events on monthly & yearly plans (or a single event with 90-day access on the one-time plan)","Up to 150 guests per event","Custom colors, fonts & photos","Voice greeting + vibe gallery","Gift registry from any store","Per-guest payment collection (PayPal, Venmo, Zelle, etc.)","Reminders & auto-save","AI invite drafting","Animated thank-you delivery","Need more than 150 guests? Upgrade to Atelier"]'::jsonb
WHERE id = 'host';

UPDATE public.pricing_tiers
SET blurb = 'For studios & planning teams — invite your whole staff, share clients, and consolidate billing.',
    features = '["Up to 5 seats (planners, assistants, designers)","Unlimited projects","25 GB attachments per workspace","Email invitations with role-based access (owner, editor, viewer)","Shared client folders across the team","Priority support","Attach projects to events (requires an Events plan)"]'::jsonb
WHERE id = 'pm_studio';
