ALTER TABLE public.sound_pieces ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS sound_pieces_is_demo_idx ON public.sound_pieces (is_demo);

CREATE OR REPLACE FUNCTION public.sound_pieces_flag_demo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  demo_user boolean := false;
  demo_event boolean := false;
BEGIN
  IF NEW.is_demo THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = NEW.user_id
      AND (u.email = 'demo@thekenroecollective.com'
           OR COALESCE((u.raw_user_meta_data->>'is_demo')::boolean, false))
  ) INTO demo_user;

  IF NEW.event_id IS NOT NULL THEN
    SELECT COALESCE(e.is_demo, false) FROM public.events e WHERE e.id = NEW.event_id INTO demo_event;
  END IF;

  IF demo_user OR COALESCE(demo_event, false) THEN
    NEW.is_demo := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sound_pieces_flag_demo_trg ON public.sound_pieces;
CREATE TRIGGER sound_pieces_flag_demo_trg
BEFORE INSERT OR UPDATE OF user_id, event_id ON public.sound_pieces
FOR EACH ROW EXECUTE FUNCTION public.sound_pieces_flag_demo();

UPDATE public.sound_pieces SET is_demo = true WHERE id = '4e556eff-aa11-4942-a209-a6e8ef1043ee';