create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  anonymous_id text unique,
  email text unique,
  name text,
  is_anonymous boolean not null default false,
  auth_provider text,
  auth_provider_user_id text unique,
  avatar_url text,
  credits_balance integer not null default 0,
  creem_customer_id text,
  metadata jsonb not null default '{}'::jsonb,
  last_ip text,
  last_country text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_users add column if not exists external_id text unique;
alter table public.app_users add column if not exists anonymous_id text unique;
alter table public.app_users add column if not exists is_anonymous boolean not null default false;
alter table public.app_users add column if not exists auth_provider text;
alter table public.app_users add column if not exists auth_provider_user_id text unique;
alter table public.app_users add column if not exists avatar_url text;
alter table public.app_users add column if not exists credits_balance integer not null default 0;
alter table public.app_users add column if not exists last_ip text;
alter table public.app_users add column if not exists last_country text;
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

create table if not exists public.face_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete set null,
  anonymous_id text,
  face_shape text not null,
  confidence numeric,
  scores jsonb not null default '{}'::jsonb,
  characteristics jsonb not null default '{}'::jsonb,
  free_result jsonb not null default '{}'::jsonb,
  full_result jsonb not null default '{}'::jsonb,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.app_users(id) on delete cascade,
  anonymous_id text,
  action text not null,
  usage_date date not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, action, usage_date),
  unique (anonymous_id, action, usage_date)
);

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  report_id uuid references public.face_reports(id) on delete cascade,
  type text not null,
  source_payment_id uuid references public.payments(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, report_id, type)
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  creem_subscription_id text not null unique,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  raw_event jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  report_id uuid references public.face_reports(id) on delete set null,
  type text not null,
  style_id text,
  credits_cost integer not null,
  status text not null default 'pending',
  result_url text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_created_at_idx on public.app_users (created_at);
create index if not exists app_users_anonymous_id_idx on public.app_users (anonymous_id);
create index if not exists app_users_auth_provider_user_id_idx on public.app_users (auth_provider_user_id);
create index if not exists app_users_last_seen_at_idx on public.app_users (last_seen_at);
create index if not exists app_users_last_ip_idx on public.app_users (last_ip);
create index if not exists app_users_last_country_idx on public.app_users (last_country);
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
create index if not exists face_reports_user_created_at_idx on public.face_reports (user_id, created_at desc);
create index if not exists face_reports_anonymous_created_at_idx on public.face_reports (anonymous_id, created_at desc);
create index if not exists usage_limits_user_action_date_idx on public.usage_limits (user_id, action, usage_date);
create index if not exists usage_limits_anonymous_action_date_idx on public.usage_limits (anonymous_id, action, usage_date);
create index if not exists user_entitlements_user_report_idx on public.user_entitlements (user_id, report_id);
create index if not exists user_subscriptions_user_status_idx on public.user_subscriptions (user_id, status);
create index if not exists ai_generations_user_created_at_idx on public.ai_generations (user_id, created_at desc);

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

drop trigger if exists face_reports_set_updated_at on public.face_reports;
create trigger face_reports_set_updated_at
before update on public.face_reports
for each row execute function public.set_updated_at();

drop trigger if exists usage_limits_set_updated_at on public.usage_limits;
create trigger usage_limits_set_updated_at
before update on public.usage_limits
for each row execute function public.set_updated_at();

drop trigger if exists user_subscriptions_set_updated_at on public.user_subscriptions;
create trigger user_subscriptions_set_updated_at
before update on public.user_subscriptions
for each row execute function public.set_updated_at();

drop trigger if exists ai_generations_set_updated_at on public.ai_generations;
create trigger ai_generations_set_updated_at
before update on public.ai_generations
for each row execute function public.set_updated_at();

alter table public.app_users enable row level security;
alter table public.payments enable row level security;
alter table public.blog_posts enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.face_reports enable row level security;
alter table public.usage_limits enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.ai_generations enable row level security;

drop policy if exists app_users_backend_all on public.app_users;
create policy app_users_backend_all
on public.app_users
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists payments_backend_all on public.payments;
create policy payments_backend_all
on public.payments
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists blog_posts_backend_all on public.blog_posts;
create policy blog_posts_backend_all
on public.blog_posts
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists credit_transactions_backend_all on public.credit_transactions;
create policy credit_transactions_backend_all
on public.credit_transactions
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists face_reports_backend_all on public.face_reports;
create policy face_reports_backend_all
on public.face_reports
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists usage_limits_backend_all on public.usage_limits;
create policy usage_limits_backend_all
on public.usage_limits
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists user_entitlements_backend_all on public.user_entitlements;
create policy user_entitlements_backend_all
on public.user_entitlements
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists user_subscriptions_backend_all on public.user_subscriptions;
create policy user_subscriptions_backend_all
on public.user_subscriptions
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists ai_generations_backend_all on public.ai_generations;
create policy ai_generations_backend_all
on public.ai_generations
for all
to anon, authenticated
using (true)
with check (true);

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

create or replace function public.increment_usage_limit(
  p_user_id uuid,
  p_anonymous_id text,
  p_action text,
  p_usage_date date,
  p_limit integer
)
returns table (
  allowed boolean,
  used integer,
  remaining integer,
  limit_value integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_used integer;
  v_lock_key integer;
begin
  if p_action is null or p_action = '' then
    raise exception 'Usage action is required';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception 'Usage limit must be positive';
  end if;

  if p_user_id is null and (p_anonymous_id is null or p_anonymous_id = '') then
    raise exception 'User id or anonymous id is required';
  end if;

  v_lock_key := hashtext(coalesce(p_user_id::text, p_anonymous_id) || ':' || p_action || ':' || p_usage_date::text);
  perform pg_advisory_xact_lock(v_lock_key);

  select usage_limits.count
    into v_current
  from public.usage_limits
  where action = p_action
    and usage_date = p_usage_date
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_user_id is null and anonymous_id = p_anonymous_id)
    )
  for update;

  if not found then
    v_used := 1;
    insert into public.usage_limits (user_id, anonymous_id, action, usage_date, count)
    values (p_user_id, p_anonymous_id, p_action, p_usage_date, v_used);

    allowed := true;
    used := v_used;
    remaining := greatest(p_limit - v_used, 0);
    limit_value := p_limit;
    return next;
    return;
  end if;

  if v_current >= p_limit then
    allowed := false;
    used := v_current;
    remaining := 0;
    limit_value := p_limit;
    return next;
    return;
  end if;

  v_used := v_current + 1;
  update public.usage_limits
    set count = v_used
  where action = p_action
    and usage_date = p_usage_date
    and (
      (p_user_id is not null and user_id = p_user_id)
      or (p_user_id is null and anonymous_id = p_anonymous_id)
    );

  allowed := true;
  used := v_used;
  remaining := greatest(p_limit - v_used, 0);
  limit_value := p_limit;
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
