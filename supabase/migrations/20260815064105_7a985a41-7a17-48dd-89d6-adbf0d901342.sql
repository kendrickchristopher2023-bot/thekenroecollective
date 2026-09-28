delete from public.vendor_reviews where vendor_id in (select id from public.vendors where slug = 'kenroe-qa-vendor-34yj');
delete from public.rfq_invitations where rfq_id in (select id from public.rfq_requests where subject like 'QA%');
delete from public.vendors where slug = 'kenroe-qa-vendor-34yj';