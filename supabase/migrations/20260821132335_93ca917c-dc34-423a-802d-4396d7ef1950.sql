CREATE OR REPLACE FUNCTION public.notify_new_ad_placement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_demo boolean := false;
BEGIN
  IF NEW.vendor_id IS NOT NULL THEN
    SELECT COALESCE(v.is_demo, false) OR COALESCE(v.slug, '') LIKE 'demo-%'
      INTO v_is_demo
    FROM public.vendors v
    WHERE v.id = NEW.vendor_id;
  END IF;

  IF COALESCE(v_is_demo, false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.admin_notifications (kind, title, body, link, metadata)
  VALUES (
    'ad_submitted',
    'New ad submitted: ' || COALESCE(NEW.headline, 'Untitled'),
    'Tier: ' || COALESCE(NEW.tier::text, 'n/a') || ' • Status: ' || COALESCE(NEW.status, 'pending'),
    '/admin',
    jsonb_build_object('placement_id', NEW.id, 'owner_user_id', NEW.owner_user_id, 'tier', NEW.tier)
  );
  RETURN NEW;
END;
$function$;