-- Seed the What's New / changelog page with plain-language entries for this
-- session's shipped work. Kept high-level and customer-facing on purpose —
-- internal security/reliability fixes are described by their user-facing
-- benefit, not by naming the underlying issue.
INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES
  (
    'A refreshed account menu',
    '👤',
    '<p>Your profile, billing, and admin tools (if you have them) now live under one clean account menu that shows exactly who''s signed in — instead of a row of separate links.</p>',
    'all',
    'published',
    '2026-07-26T04:00:00Z'
  ),
  (
    'Introducing What''s New',
    '📋',
    '<p>This page! From now on, updates to The Kenroe Collective — big and small — get posted here as they ship.</p>',
    'all',
    'published',
    '2026-07-26T04:01:00Z'
  ),
  (
    'Print-ready invitations, properly centered',
    '🖨️',
    '<p>Downloaded invitation PDFs now sit perfectly centered on the page, whether you''re saving a file or printing at home.</p>',
    'all',
    'published',
    '2026-07-26T04:02:00Z'
  ),
  (
    'Better vendor quote requests',
    '🤝',
    '<p>Vendors responding to quote requests in Vendor Hub can now submit real bid amounts and get compared side-by-side, instead of a plain message thread.</p>',
    'all',
    'published',
    '2026-07-26T04:03:00Z'
  ),
  (
    'Cleaned up sharing options',
    '🔗',
    '<p>Removed a few unused design-tool shortcuts from Share &amp; integrations, and fixed Instagram/Snapchat sharing so your invite text is copied to your clipboard before the app opens.</p>',
    'all',
    'published',
    '2026-07-26T04:04:00Z'
  ),
  (
    'Behind-the-scenes reliability improvements',
    '🔒',
    '<p>We tightened up a number of data-handling and permission checks across the app — guest RSVPs, gift contributions, admin tools, and account permissions are all a bit more robust.</p>',
    'all',
    'published',
    '2026-07-26T04:05:00Z'
  );
