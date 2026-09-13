CREATE OR REPLACE FUNCTION public.notify_new_vendor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.admin_notifications (kind, title, body, link, metadata)
  VALUES (
    'vendor_created',
    'New vendor profile: ' || COALESCE(NEW.name, 'Unnamed'),
    COALESCE(NEW.category, '') || ' • ' || COALESCE(NEW.city, ''),
    '/vendors/' || COALESCE(NEW.slug, NEW.id::text),
    jsonb_build_object('vendor_id', NEW.id, 'owner_user_id', NEW.owner_user_id)
  );
  RETURN NEW;
END;
$function$;