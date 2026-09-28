
-- Restrict SECURITY DEFINER helpers to intended callers
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM PUBLIC, anon;

-- Tighten ticket insert policy
DROP POLICY "anyone can create ticket" ON public.support_tickets;
CREATE POLICY "anyone can create ticket" ON public.support_tickets FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(contact_email) BETWEEN 3 AND 200
    AND char_length(subject) BETWEEN 1 AND 200
    AND char_length(message) BETWEEN 1 AND 5000
    AND (user_id IS NULL OR user_id = auth.uid())
  );
