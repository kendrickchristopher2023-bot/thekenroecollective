UPDATE public.pricing_tiers
SET features = '["1 active event","Up to 25 guests","Classic invite page","Email invitations included","RSVP tracking","1 reminder per event","Branded with The Kenroe Collective","No SMS reminders","No AI invite art","No music / playlist link","No payment collection"]'::jsonb,
    blurb = 'Free forever — email invitations, RSVPs, and a simple invite page. No SMS, no AI, no music links.'
WHERE id = 'postcard';