-- Owner-side inserts run as authenticated, so the column default must be callable by them.
GRANT EXECUTE ON FUNCTION public.gen_schedule_short_code() TO authenticated;