
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and owners can view notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'owner'));

CREATE TABLE public.admin_notification_reads (
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notification_reads TO authenticated;
GRANT ALL ON public.admin_notification_reads TO service_role;
ALTER TABLE public.admin_notification_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own reads"
  ON public.admin_notification_reads FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: notify on new vendor profile
CREATE OR REPLACE FUNCTION public.notify_new_vendor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_notifications (kind, title, body, link, metadata)
  VALUES (
    'vendor_created',
    'New vendor profile: ' || COALESCE(NEW.business_name, 'Unnamed'),
    COALESCE(NEW.category, '') || ' • ' || COALESCE(NEW.city, ''),
    '/vendors/' || COALESCE(NEW.slug, NEW.id::text),
    jsonb_build_object('vendor_id', NEW.id, 'owner_user_id', NEW.owner_user_id)
  );
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_notify_new_vendor
  AFTER INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_vendor();

-- Trigger: notify on new ad placement
CREATE OR REPLACE FUNCTION public.notify_new_ad_placement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
$$;
CREATE TRIGGER trg_notify_new_ad_placement
  AFTER INSERT ON public.ad_placements
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_ad_placement();
