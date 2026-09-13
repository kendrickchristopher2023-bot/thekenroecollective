DELETE FROM public.pm_invites WHERE project_id IN (SELECT id FROM public.pm_projects WHERE owner_user_id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be'));
DELETE FROM public.pm_projects WHERE owner_user_id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be');
DELETE FROM public.events WHERE user_id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be');
DELETE FROM public.subscriptions WHERE user_id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be');
DELETE FROM public.profiles WHERE id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be');
DELETE FROM auth.users WHERE id IN ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','f29ca780-51af-4def-89c8-c2fc9292a5be');