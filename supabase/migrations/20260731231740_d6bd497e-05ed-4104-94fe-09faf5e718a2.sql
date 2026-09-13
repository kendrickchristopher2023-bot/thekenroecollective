CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins can read audit log"
ON public.admin_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

-- Only super admins may grant/revoke privileged roles.
CREATE OR REPLACE FUNCTION public.super_admin_set_role(
  _target_user_id uuid,
  _role public.app_role,
  _grant boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _remaining int;
BEGIN
  IF NOT public.has_role(_actor, 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: super_admin required';
  END IF;

  IF _role = 'super_admin' AND _grant = false AND _target_user_id = _actor THEN
    RAISE EXCEPTION 'You cannot revoke your own super_admin role';
  END IF;

  IF _grant THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, _role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    IF _role = 'super_admin' THEN
      SELECT count(*) INTO _remaining FROM public.user_roles WHERE role = 'super_admin';
      IF _remaining <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the last super_admin';
      END IF;
    END IF;
    DELETE FROM public.user_roles WHERE user_id = _target_user_id AND role = _role;
  END IF;

  INSERT INTO public.admin_audit_log (actor_user_id, action, target_user_id, details)
  VALUES (
    _actor,
    CASE WHEN _grant THEN 'role.grant' ELSE 'role.revoke' END,
    _target_user_id,
    jsonb_build_object('role', _role)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.super_admin_set_role(uuid, public.app_role, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.super_admin_set_role(uuid, public.app_role, boolean) TO authenticated;