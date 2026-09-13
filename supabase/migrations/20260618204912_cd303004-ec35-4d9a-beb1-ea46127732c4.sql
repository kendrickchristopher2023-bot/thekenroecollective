
CREATE TYPE public.pm_member_role AS ENUM ('admin', 'editor', 'viewer');
CREATE TYPE public.pm_task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done');

CREATE TABLE public.pm_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6',
  event_id TEXT REFERENCES public.events(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_projects TO authenticated;
GRANT ALL ON public.pm_projects TO service_role;
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.pm_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.pm_member_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_project_members TO authenticated;
GRANT ALL ON public.pm_project_members TO service_role;
ALTER TABLE public.pm_project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.pm_is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = _project_id AND p.owner_user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.pm_project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.pm_can_edit_project(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = _project_id AND p.owner_user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.pm_project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.role IN ('admin','editor'));
$$;

CREATE OR REPLACE FUNCTION public.pm_is_project_admin(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.pm_projects p WHERE p.id = _project_id AND p.owner_user_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.pm_project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.role = 'admin');
$$;

CREATE POLICY "members can view projects" ON public.pm_projects FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.pm_is_project_member(id, auth.uid()));
CREATE POLICY "users create own projects" ON public.pm_projects FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "owner or admin update project" ON public.pm_projects FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.pm_is_project_admin(id, auth.uid()))
  WITH CHECK (owner_user_id = auth.uid() OR public.pm_is_project_admin(id, auth.uid()));
CREATE POLICY "owner deletes project" ON public.pm_projects FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());

CREATE POLICY "members view membership" ON public.pm_project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.pm_is_project_member(project_id, auth.uid()));
CREATE POLICY "admins manage members" ON public.pm_project_members FOR ALL TO authenticated
  USING (public.pm_is_project_admin(project_id, auth.uid()))
  WITH CHECK (public.pm_is_project_admin(project_id, auth.uid()));

CREATE TABLE public.pm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.pm_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.pm_task_status NOT NULL DEFAULT 'todo',
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_tasks TO authenticated;
GRANT ALL ON public.pm_tasks TO service_role;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view tasks" ON public.pm_tasks FOR SELECT TO authenticated
  USING (public.pm_is_project_member(project_id, auth.uid()));
CREATE POLICY "editors create tasks" ON public.pm_tasks FOR INSERT TO authenticated
  WITH CHECK (public.pm_can_edit_project(project_id, auth.uid()));
CREATE POLICY "editors update tasks" ON public.pm_tasks FOR UPDATE TO authenticated
  USING (public.pm_can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.pm_can_edit_project(project_id, auth.uid()));
CREATE POLICY "editors delete tasks" ON public.pm_tasks FOR DELETE TO authenticated
  USING (public.pm_can_edit_project(project_id, auth.uid()));

CREATE TABLE public.pm_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_task_comments TO authenticated;
GRANT ALL ON public.pm_task_comments TO service_role;
ALTER TABLE public.pm_task_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view comments" ON public.pm_task_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pm_tasks t WHERE t.id = task_id AND public.pm_is_project_member(t.project_id, auth.uid())));
CREATE POLICY "editors add comments" ON public.pm_task_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pm_tasks t WHERE t.id = task_id AND public.pm_can_edit_project(t.project_id, auth.uid())));
CREATE POLICY "authors delete own comments" ON public.pm_task_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid());

CREATE TABLE public.pm_task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pm_task_attachments TO authenticated;
GRANT ALL ON public.pm_task_attachments TO service_role;
ALTER TABLE public.pm_task_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members view attachments" ON public.pm_task_attachments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pm_tasks t WHERE t.id = task_id AND public.pm_is_project_member(t.project_id, auth.uid())));
CREATE POLICY "editors add attachments" ON public.pm_task_attachments FOR INSERT TO authenticated
  WITH CHECK (uploader_user_id = auth.uid() AND EXISTS (SELECT 1 FROM public.pm_tasks t WHERE t.id = task_id AND public.pm_can_edit_project(t.project_id, auth.uid())));
CREATE POLICY "uploaders delete own attachments" ON public.pm_task_attachments FOR DELETE TO authenticated
  USING (uploader_user_id = auth.uid());

CREATE TRIGGER pm_projects_updated BEFORE UPDATE ON public.pm_projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER pm_tasks_updated BEFORE UPDATE ON public.pm_tasks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX pm_tasks_project_idx ON public.pm_tasks(project_id, status, position);
CREATE INDEX pm_projects_owner_idx ON public.pm_projects(owner_user_id) WHERE archived_at IS NULL;
CREATE INDEX pm_members_user_idx ON public.pm_project_members(user_id);
