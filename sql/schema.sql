create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  anonymous_id text unique,
  email text unique,
  name text,
  is_anonymous boolean not null default false,
  creem_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists external_id text unique;
alter table public.app_users add column if not exists anonymous_id text unique;
alter table public.app_users add column if not exists is_anonymous boolean not null default false;
alter table public.app_users add column if not exists last_seen_at timestamptz not null default now();
alter table public.app_users alter column email drop not null;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  email text,
  creem_event_id text not null unique,
  creem_checkout_id text,
  creem_order_id text,
  creem_subscription_id text,
  creem_transaction_id text,
  creem_customer_id text,
  request_id text,
  product_id text,
  product_name text,
  amount integer not null default 0,
  currency text not null default 'USD',
  status text not null default 'completed',
  paid_at timestamptz,
  event_type text,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_created_at_idx on public.app_users (created_at);
create index if not exists app_users_anonymous_id_idx on public.app_users (anonymous_id);
create index if not exists app_users_last_seen_at_idx on public.app_users (last_seen_at);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists payments_created_at_idx on public.payments (created_at);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_currency_idx on public.payments (currency);
create index if not exists payments_creem_transaction_id_idx on public.payments (creem_transaction_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.payments enable row level security;

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
    (select count(*) from public.app_users) as total_users,
    (select count(*) from public.app_users where created_at >= p_day_start and created_at < p_day_end) as today_users,
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

create or replace function public.get_daily_revenue(
  p_days integer default 30,
  p_offset_minutes integer default 480
)
returns table (
  day date,
  revenue bigint,
  payments_count bigint
)
language sql
security definer
set search_path = public
as $$
  with safe_days as (
    select least(greatest(coalesce(p_days, 30), 1), 120) as value
  ),
  days as (
    select generate_series(
      (current_timestamp + make_interval(mins => p_offset_minutes))::date - ((select value from safe_days) - 1),
      (current_timestamp + make_interval(mins => p_offset_minutes))::date,
      interval '1 day'
    )::date as day
  ),
  daily as (
    select
      (coalesce(paid_at, created_at) + make_interval(mins => p_offset_minutes))::date as day,
      coalesce(sum(amount), 0)::bigint as revenue,
      count(*)::bigint as payments_count
    from public.payments
    where status in ('completed', 'paid', 'active')
      and coalesce(paid_at, created_at) >= (
        (((current_timestamp + make_interval(mins => p_offset_minutes))::date - ((select value from safe_days) - 1))::timestamp)
        - make_interval(mins => p_offset_minutes)
      )
    group by 1
  )
  select
    days.day,
    coalesce(daily.revenue, 0)::bigint as revenue,
    coalesce(daily.payments_count, 0)::bigint as payments_count
  from days
  left join daily on daily.day = days.day
  order by days.day;
$$;
