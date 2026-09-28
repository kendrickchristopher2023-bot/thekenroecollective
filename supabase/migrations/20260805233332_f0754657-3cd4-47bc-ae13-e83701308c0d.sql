DROP POLICY IF EXISTS "Admins insert announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins update announcements" ON public.announcements;

CREATE POLICY "Insert announcements by audience"
ON public.announcements
FOR INSERT
TO authenticated
WITH CHECK (
  CASE
    WHEN audience = 'all_users'::announcement_audience
      THEN public.has_role(auth.uid(), 'owner'::public.app_role)
    ELSE
      event_id IS NOT NULL
      AND (
        public.get_event_owner_id(event_id) = auth.uid()
        OR public.has_role(auth.uid(), 'owner'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  END
);

CREATE POLICY "Update announcements by audience"
ON public.announcements
FOR UPDATE
TO authenticated
USING (
  CASE
    WHEN audience = 'all_users'::announcement_audience
      THEN public.has_role(auth.uid(), 'owner'::public.app_role)
    ELSE
      event_id IS NOT NULL
      AND (
        public.get_event_owner_id(event_id) = auth.uid()
        OR public.has_role(auth.uid(), 'owner'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  END
)
WITH CHECK (
  CASE
    WHEN audience = 'all_users'::announcement_audience
      THEN public.has_role(auth.uid(), 'owner'::public.app_role)
    ELSE
      event_id IS NOT NULL
      AND (
        public.get_event_owner_id(event_id) = auth.uid()
        OR public.has_role(auth.uid(), 'owner'::public.app_role)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
      )
  END
);