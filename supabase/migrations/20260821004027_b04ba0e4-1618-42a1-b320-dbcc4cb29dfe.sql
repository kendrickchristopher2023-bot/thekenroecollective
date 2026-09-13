DELETE FROM public.admin_notification_reads r
USING public.admin_notifications n
WHERE r.notification_id = n.id
  AND n.kind = 'vendor_created'
  AND NOT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id::text = n.metadata->>'vendor_id'
      AND COALESCE(v.is_demo, false) = false
  );

DELETE FROM public.admin_notifications n
WHERE n.kind = 'vendor_created'
  AND NOT EXISTS (
    SELECT 1 FROM public.vendors v
    WHERE v.id::text = n.metadata->>'vendor_id'
      AND COALESCE(v.is_demo, false) = false
  );