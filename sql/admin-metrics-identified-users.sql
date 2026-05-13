create or replace function public.get_admin_metrics(
  p_day_start timestamptz,
  p_day_end timestamptz
)
returns table (
  total_users bigint,
  today_users bigint,
  today_revenue bigint,
  total_revenue bigint
)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*) from public.app_users where is_anonymous = false) as total_users,
    (
      select count(*)
      from public.app_users
      where is_anonymous = false
        and created_at >= p_day_start
        and created_at < p_day_end
    ) as today_users,
    (
      select coalesce(sum(amount), 0)::bigint
      from public.payments
      where status in ('completed', 'paid', 'active')
        and coalesce(paid_at, created_at) >= p_day_start
        and coalesce(paid_at, created_at) < p_day_end
    ) as today_revenue,
    (
      select coalesce(sum(amount), 0)::bigint
      from public.payments
      where status in ('completed', 'paid', 'active')
    ) as total_revenue;
$$;
