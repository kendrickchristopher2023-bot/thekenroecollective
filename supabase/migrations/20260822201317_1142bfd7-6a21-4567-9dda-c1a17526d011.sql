CREATE TABLE public.owner_ai_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id uuid REFERENCES public.owner_ai_threads(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL,
  created_by_email text,
  kind text NOT NULL CHECK (kind IN ('refund','tier_change','customer_email','customer_sms','ticket_reply')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','executing','executed','failed','rejected','expired')),
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  amount_cents integer,
  requires_amount_confirmation boolean NOT NULL DEFAULT false,
  target_user_id uuid,
  target_label text,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '24 hours'),
  approved_by_user_id uuid,
  approved_by_email text,
  approved_at timestamp with time zone,
  rejected_by_user_id uuid,
  rejected_by_email text,
  rejected_at timestamp with time zone,
  reject_reason text,
  executed_at timestamp with time zone,
  execution_result jsonb,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.owner_ai_actions TO service_role;

ALTER TABLE public.owner_ai_actions ENABLE ROW LEVEL SECURITY;

CREATE INDEX owner_ai_actions_status_idx ON public.owner_ai_actions (status, created_at DESC);
CREATE INDEX owner_ai_actions_thread_idx ON public.owner_ai_actions (thread_id, created_at DESC);

CREATE TRIGGER owner_ai_actions_touch
BEFORE UPDATE ON public.owner_ai_actions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomically claim exactly one pending, unexpired draft for execution.
-- Returns the claimed row, or nothing when the draft is already claimed,
-- already executed, rejected, or past its 24-hour expiry.
CREATE OR REPLACE FUNCTION public.claim_owner_ai_action(
  _action_id uuid,
  _approver uuid,
  _approver_email text
)
RETURNS SETOF public.owner_ai_actions
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.owner_ai_actions
  SET status = 'executing',
      approved_by_user_id = _approver,
      approved_by_email = _approver_email,
      approved_at = now()
  WHERE id = _action_id
    AND status = 'pending'
    AND expires_at > now()
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.claim_owner_ai_action(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_owner_ai_action(uuid, uuid, text) TO service_role;
