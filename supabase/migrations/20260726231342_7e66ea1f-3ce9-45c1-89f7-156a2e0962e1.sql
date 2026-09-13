-- Pull the "Project Management — Team" ($12/mo, pm_studio) tier: audit found
-- it delivered nothing beyond the $5 Solo tier (seat caps come from event
-- tier, not PM SKU; no project/storage limits exist; "client folders" never
-- shipped). Zero customers were ever subscribed to it. Also corrects Solo's
-- feature copy to match what's actually enforced today.
update public.pricing_tiers set active = false where id = 'pm_studio';

update public.pricing_tiers
set features = '["Seats included by your account plan (3 on Postcard/Whisper, 5 on Host, 20 on Atelier)","Unlimited projects","Unlimited tasks","Attachments included, no fixed cap","Attach to events (requires Host or Atelier)"]'::jsonb
where id = 'pm_solo';

-- What's New entry.
INSERT INTO public.product_updates (title, emoji, body_html, audience_tier, status, published_at)
VALUES
  (
    'Simplified Project Management pricing',
    '📋',
    '<p>Consolidated down to one Project Management add-on ($5/mo or $48/yr) with unlimited projects, tasks, and attachments. Seats scale with your account plan automatically.</p>',
    'all',
    'published',
    '2026-07-26T23:13:00Z'
  );
