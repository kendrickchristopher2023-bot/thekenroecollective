ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS sms_pack_enabled boolean NOT NULL DEFAULT false;
