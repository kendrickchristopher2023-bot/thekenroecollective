
ALTER TABLE public.media_uploads
  ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT 'Uncluttered',
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS alt_text text,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS responsive_group_id uuid,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS media_uploads_user_folder_idx
  ON public.media_uploads(user_id, folder) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_uploads_user_deleted_idx
  ON public.media_uploads(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS media_uploads_group_idx
  ON public.media_uploads(responsive_group_id) WHERE responsive_group_id IS NOT NULL;
