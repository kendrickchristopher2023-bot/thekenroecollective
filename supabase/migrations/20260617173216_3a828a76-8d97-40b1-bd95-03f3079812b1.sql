update public.pricing_tiers
set name = 'Whisper',
    price_monthly = 7,
    sort_order = 0,
    blurb = 'One intimate gathering, beautifully done. Clean interface, zero ads — a one-time $7 unlock.',
    features = '["1 event, up to 25 guests","Clean, distraction-free interface","No ads — ever","Beautiful RSVP tracking","Classic invite designs","Email reminders","One-time payment — no subscription"]'::jsonb
where id = 'free';