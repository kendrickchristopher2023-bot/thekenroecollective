update public.profiles set tier='host' where id='41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3';
insert into public.subscriptions (user_id, price_id, product_id, status, stripe_customer_id, stripe_subscription_id, environment, current_period_end)
values
 ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','host_monthly','host_plan','active','cus_qatest_host','sub_qatest_host','sandbox', now()+interval '30 days'),
 ('41bcaa3c-ce2e-4d13-894a-129ea7d6bfb3','pm_addon_monthly','pm_addon','active','cus_qatest_host','sub_qatest_host_pm','sandbox', now()+interval '30 days'),
 ('f29ca780-51af-4def-89c8-c2fc9292a5be','pm_solo_monthly','pm_solo','active','cus_qatest_pm','sub_qatest_pm','sandbox', now()+interval '30 days');