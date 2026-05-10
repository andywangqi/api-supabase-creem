create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  anonymous_id text unique,
  email text unique,
  name text,
  is_anonymous boolean not null default false,
  credits_balance integer not null default 0,
  creem_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists external_id text unique;
alter table public.app_users add column if not exists anonymous_id text unique;
alter table public.app_users add column if not exists is_anonymous boolean not null default false;
alter table public.app_users add column if not exists credits_balance integer not null default 0;
alter table public.app_users add column if not exists last_seen_at timestamptz not null default now();
alter table public.app_users alter column email drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_users_credits_balance_nonnegative'
  ) then
    alter table public.app_users
      add constraint app_users_credits_balance_nonnegative check (credits_balance >= 0);
  end if;
end;
$$;

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

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text not null,
  cover_image_url text,
  author_name text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  metadata jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null,
  source text not null default 'manual',
  reason text,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists app_users_created_at_idx on public.app_users (created_at);
create index if not exists app_users_anonymous_id_idx on public.app_users (anonymous_id);
create index if not exists app_users_last_seen_at_idx on public.app_users (last_seen_at);
create index if not exists app_users_credits_balance_idx on public.app_users (credits_balance);
create index if not exists payments_paid_at_idx on public.payments (paid_at);
create index if not exists payments_created_at_idx on public.payments (created_at);
create index if not exists payments_status_idx on public.payments (status);
create index if not exists payments_currency_idx on public.payments (currency);
create index if not exists payments_creem_transaction_id_idx on public.payments (creem_transaction_id);
create index if not exists blog_posts_status_published_at_idx on public.blog_posts (status, published_at desc);
create index if not exists blog_posts_created_at_idx on public.blog_posts (created_at desc);
create index if not exists credit_transactions_user_created_at_idx on public.credit_transactions (user_id, created_at desc);
create index if not exists credit_transactions_created_at_idx on public.credit_transactions (created_at desc);

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

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
before update on public.blog_posts
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.payments enable row level security;
alter table public.blog_posts enable row level security;
alter table public.credit_transactions enable row level security;

create or replace function public.adjust_user_credits(
  p_user_id uuid,
  p_delta integer,
  p_source text default 'manual',
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_created_by text default null,
  p_idempotency_key text default null,
  p_allow_negative boolean default false
)
returns table (
  user_id uuid,
  credits_balance integer,
  transaction_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
  v_new_balance integer;
  v_transaction_id uuid;
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'Credit delta must not be zero';
  end if;

  if p_idempotency_key is not null then
    select ct.id, ct.balance_after
      into v_transaction_id, v_new_balance
    from public.credit_transactions ct
    where ct.idempotency_key = p_idempotency_key;

    if found then
      user_id := p_user_id;
      credits_balance := v_new_balance;
      transaction_id := v_transaction_id;
      return next;
      return;
    end if;
  end if;

  select app_users.credits_balance
    into v_current_balance
  from public.app_users
  where app_users.id = p_user_id
  for update;

  if not found then
    raise exception 'User not found';
  end if;

  v_new_balance := v_current_balance + p_delta;
  if v_new_balance < 0 and not p_allow_negative then
    raise exception 'Insufficient credits';
  end if;

  update public.app_users
    set credits_balance = v_new_balance
  where app_users.id = p_user_id;

  insert into public.credit_transactions (
    user_id,
    delta,
    balance_after,
    source,
    reason,
    idempotency_key,
    metadata,
    created_by
  )
  values (
    p_user_id,
    p_delta,
    v_new_balance,
    coalesce(nullif(p_source, ''), 'manual'),
    p_reason,
    p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb),
    p_created_by
  )
  returning id into v_transaction_id;

  user_id := p_user_id;
  credits_balance := v_new_balance;
  transaction_id := v_transaction_id;
  return next;
end;
$$;

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
