INSERT INTO public.product_updates (
  title,
  emoji,
  body_html,
  audience_tier,
  status,
  published_at
)
SELECT
  'Events and Gatherings: Print thank-you cards at home, free',
  '💌',
  '<p>Hosts can now download print-ready thank-you cards, Avery 5160 mailing labels, and A7 envelope files at no extra charge. Print at home or take the files to a print shop. Cards with a song, letter, spoken piece, or GIF include a private code for each guest.</p>',
  'all',
  'published',
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.product_updates
  WHERE title = 'Events and Gatherings: Print thank-you cards at home, free'
);