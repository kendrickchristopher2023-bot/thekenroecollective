-- Owner-only AI assistant storage. All access is server-side (service_role)
-- after the owner allowlist + role + MFA(aal2) checks, so no anon/authenticated
-- grants are issued and RLS denies everything by default.

CREATE TABLE public.owner_ai_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  owner_email text,
  title text NOT NULL DEFAULT 'New conversation',
  message_count integer NOT NULL DEFAULT 0,
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.owner_ai_threads TO service_role;
ALTER TABLE public.owner_ai_threads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.owner_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.owner_ai_threads(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.owner_ai_messages TO service_role;
ALTER TABLE public.owner_ai_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX owner_ai_messages_thread_idx ON public.owner_ai_messages (thread_id, created_at);

CREATE TABLE public.owner_ai_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,
  owner_user_id uuid NOT NULL,
  owner_email text,
  question text NOT NULL,
  tools_used jsonb NOT NULL DEFAULT '[]'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_micro_usd integer NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'answered',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.owner_ai_audit TO service_role;
ALTER TABLE public.owner_ai_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX owner_ai_audit_owner_idx ON public.owner_ai_audit (owner_user_id, created_at DESC);

CREATE TABLE public.owner_ai_usage (
  owner_user_id uuid NOT NULL,
  day date NOT NULL,
  questions integer NOT NULL DEFAULT 0,
  cost_micro_usd integer NOT NULL DEFAULT 0,
  last_question_at timestamptz,
  minute_window_started_at timestamptz,
  minute_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_user_id, day)
);
GRANT ALL ON public.owner_ai_usage TO service_role;
ALTER TABLE public.owner_ai_usage ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER owner_ai_threads_touch
  BEFORE UPDATE ON public.owner_ai_threads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
