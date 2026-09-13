-- Corrected stale yearly/one-time price copy in tier-config.ts and the
-- Concierge chatbot that didn't match the live pricing_tiers table.
INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES
  (
    'Cleaned up plan pricing details',
    '💵',
    '<p>Fixed a few places where our own docs and Concierge chatbot were quoting outdated yearly and one-time prices. Everything now matches what''s shown on the pricing page.</p>',
    'all',
    'published',
    '2026-07-27T00:20:00Z'
  );
