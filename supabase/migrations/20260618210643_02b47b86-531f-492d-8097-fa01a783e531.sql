ALTER TABLE public.pm_tasks
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_pm_tasks_project_status ON public.pm_tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_pm_projects_event_id ON public.pm_projects(event_id);

DROP TRIGGER IF EXISTS touch_pm_projects_updated_at ON public.pm_projects;
CREATE TRIGGER touch_pm_projects_updated_at
BEFORE UPDATE ON public.pm_projects
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_pm_tasks_updated_at ON public.pm_tasks;
CREATE TRIGGER touch_pm_tasks_updated_at
BEFORE UPDATE ON public.pm_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();