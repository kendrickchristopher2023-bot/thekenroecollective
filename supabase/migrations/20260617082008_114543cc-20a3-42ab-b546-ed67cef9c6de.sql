
-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "see own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Bootstrap: first signed-in user can claim admin if no admins exist.
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN FALSE; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN RETURN FALSE; END IF;
  INSERT INTO public.user_roles(user_id, role) VALUES (_uid, 'admin') ON CONFLICT DO NOTHING;
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated;

-- Auto-create profile + default user role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ PRICING ============
CREATE TABLE public.pricing_tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  blurb TEXT NOT NULL DEFAULT '',
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  popular BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pricing_tiers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pricing_tiers TO authenticated;
GRANT ALL ON public.pricing_tiers TO service_role;
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active tiers" ON public.pricing_tiers FOR SELECT TO anon, authenticated USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin insert tiers" ON public.pricing_tiers FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin update tiers" ON public.pricing_tiers FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin delete tiers" ON public.pricing_tiers FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.pricing_tiers (id, name, blurb, price_monthly, features, popular, sort_order) VALUES
('free','Whisper','For your first small gathering.',0,
  '["1 event","Up to 25 guests","RSVP tracking","Basic invite design"]'::jsonb, false, 1),
('host','Host','Everything you need for a memorable night.',19,
  '["Unlimited events","Up to 200 guests / event","Custom colors, fonts, photos","Voice greeting + vibe gallery","Gift registry from any store","Reminders & auto-save","Digital thank-you cards"]'::jsonb, true, 2),
('atelier','Atelier','For producers, planners, and brands.',49,
  '["Everything in Host","Unlimited guests","Payment collection","Printed & mailed thank-you cards","Social share hub & AI drafting","Branded sign-up link","Priority support"]'::jsonb, false, 3);

-- ============ DISCOUNT CODES ============
CREATE TABLE public.discount_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  percent_off INT,
  amount_off NUMERIC(10,2),
  tier_id TEXT REFERENCES public.pricing_tiers(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  max_uses INT,
  used_count INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.discount_codes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.discount_codes TO authenticated;
GRANT ALL ON public.discount_codes TO service_role;
ALTER TABLE public.discount_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read active codes" ON public.discount_codes FOR SELECT TO anon, authenticated
  USING (active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin write codes" ON public.discount_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ SUPPORT TICKETS ============
CREATE TABLE public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email TEXT NOT NULL,
  contact_name TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  ai_draft TEXT,
  final_reply TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.support_tickets TO authenticated;
GRANT INSERT ON public.support_tickets TO anon;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can create ticket" ON public.support_tickets FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "owner read ticket" ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write ticket" ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin delete ticket" ON public.support_tickets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- ============ AI CHAT MESSAGES ============
CREATE TABLE public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_user_idx ON public.support_messages(user_id, created_at);
GRANT SELECT, INSERT, DELETE ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.support_messages FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
