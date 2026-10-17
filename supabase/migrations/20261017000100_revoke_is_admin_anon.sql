-- is_admin() only makes sense for signed-in users (RLS policies call it)
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
