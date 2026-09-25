DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['schedules','schedule_exceptions','schedule_people','schedule_reminder_steps','schedule_occurrences','schedule_reminder_sends','contact_imports'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules, public.schedule_exceptions, public.schedule_people, public.schedule_reminder_steps TO authenticated;
GRANT SELECT ON public.schedule_occurrences, public.schedule_reminder_sends, public.contact_imports TO authenticated;