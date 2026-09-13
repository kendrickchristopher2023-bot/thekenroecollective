ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guest_import_enabled boolean NOT NULL DEFAULT false;