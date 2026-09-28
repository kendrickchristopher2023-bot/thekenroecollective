
-- Storage policies for pm-attachments
-- Path convention: {project_id}/{task_id}/{filename}
CREATE POLICY "pm members view attachments" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pm-attachments'
    AND public.pm_is_project_member((string_to_array(name, '/'))[1]::uuid, auth.uid())
  );

CREATE POLICY "pm editors upload attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pm-attachments'
    AND public.pm_can_edit_project((string_to_array(name, '/'))[1]::uuid, auth.uid())
  );

CREATE POLICY "pm uploaders delete own files" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pm-attachments'
    AND owner = auth.uid()
  );
