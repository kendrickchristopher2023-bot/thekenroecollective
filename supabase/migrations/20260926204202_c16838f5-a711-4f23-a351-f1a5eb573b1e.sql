alter table public.schedules
  add column if not exists meeting_id text,
  add column if not exists meeting_passcode text;

update public.schedules
set meeting_id = coalesce(nullif(meeting_id, ''), '628 671 9107'),
    meeting_passcode = coalesce(nullif(meeting_passcode, ''), '121212')
where id = '3e9d32bc-f47f-4b78-9fb4-7e08e54f6e5f'
  and join_url = 'https://us05web.zoom.us/j/6286719107'
  and dial_pin = '121212'
  and description like '%Meeting ID: 628 671 9107%'
  and description like '%Passcode: 121212%';