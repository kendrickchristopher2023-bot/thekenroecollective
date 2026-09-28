-- Full-system audit batch: seating/check-in tier clarity, Branded Subdomain
-- retirement, and Host/Atelier perks now working as advertised.
INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES
  (
    'Clearer day-of toolkit access',
    '🪑',
    '<p>Seating charts, door check-in, and run-of-show are part of the Atelier day-of toolkit. Updated our docs and Concierge chatbot to say so clearly.</p>',
    'all',
    'published',
    '2026-07-27T01:00:00Z'
  ),
  (
    'Simplified branded links',
    '🔗',
    '<p>Removed the Branded Subdomain add-on until real subdomain routing is ready. Every event still gets a clean, shareable vanity link for free.</p>',
    'all',
    'published',
    '2026-07-27T01:01:00Z'
  ),
  (
    'SMS reminders panel fixed for Whisper',
    '💬',
    '<p>Fixed a bug where Whisper hosts could see the SMS reminders panel gated behind a Host-only wall even though SMS reminders are included on Whisper.</p>',
    'all',
    'published',
    '2026-07-27T01:02:00Z'
  );
