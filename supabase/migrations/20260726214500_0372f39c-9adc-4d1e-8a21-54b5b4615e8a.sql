-- Seed What's New with plain-language entries for this session's add-ons
-- audit. Kept high-level and customer-facing — billing/entitlement
-- corrections are described by their user-facing benefit, not by naming
-- the underlying mismatch.
INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES
  (
    'Photo Wall sharing, made easier',
    '📸',
    '<p>If your event has Photo Wall, you''ll now find a ready-to-go slideshow link and a printable QR code right in Share &amp; integrations — perfect for a table card or a TV at the venue.</p>',
    'all',
    'published',
    '2026-07-26T05:00:00Z'
  ),
  (
    'Simplified our add-ons catalog',
    '🧹',
    '<p>Removed a couple of add-on options that weren''t ready for prime time. The rest of the catalog works exactly the same.</p>',
    'all',
    'published',
    '2026-07-26T05:01:00Z'
  ),
  (
    'Clearer access across paid plans',
    '✅',
    '<p>Tightened up how a few paid features (like Photo Wall and SMS reminders) recognize your plan and any add-ons you''ve purchased, so access matches what you''re on more reliably.</p>',
    'all',
    'published',
    '2026-07-26T05:02:00Z'
  );
