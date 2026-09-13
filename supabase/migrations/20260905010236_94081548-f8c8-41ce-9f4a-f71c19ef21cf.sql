UPDATE public.sound_pieces
SET settings = jsonb_set(settings, '{voice}', '"duet, a woman and a man"'::jsonb),
    updated_at = now()
WHERE settings->>'voice' = 'duet';

UPDATE public.sound_pieces
SET settings = jsonb_set(settings, '{voice}', '"a woman and a man trading lines"'::jsonb),
    updated_at = now()
WHERE settings->>'voice' = 'two voices trading lines';

UPDATE public.event_wall_music
SET settings = jsonb_set(settings, '{voice}', '"duet, a woman and a man"'::jsonb)
WHERE settings->>'voice' = 'duet';

UPDATE public.event_wall_music
SET settings = jsonb_set(settings, '{voice}', '"a woman and a man trading lines"'::jsonb)
WHERE settings->>'voice' = 'two voices trading lines';