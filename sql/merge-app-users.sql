create or replace function public.merge_app_users(
  p_target_user_id uuid,
  p_source_user_id uuid
)
returns public.app_users
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.app_users%rowtype;
  v_source public.app_users%rowtype;
begin
  if p_target_user_id is null or p_source_user_id is null then
    raise exception 'Target user id and source user id are required';
  end if;

  select *
    into v_target
  from public.app_users
  where id = p_target_user_id
  for update;

  if not found then
    raise exception 'Target user not found';
  end if;

  if p_target_user_id = p_source_user_id then
    return v_target;
  end if;

  select *
    into v_source
  from public.app_users
  where id = p_source_user_id
  for update;

  if not found then
    return v_target;
  end if;

  update public.payments
    set user_id = p_target_user_id
  where user_id = p_source_user_id;

  update public.face_reports
    set user_id = p_target_user_id,
        anonymous_id = coalesce(v_target.anonymous_id, v_source.anonymous_id, anonymous_id)
  where user_id = p_source_user_id
     or (v_source.anonymous_id is not null and anonymous_id = v_source.anonymous_id);

  insert into public.usage_limits (user_id, anonymous_id, action, usage_date, count, created_at, updated_at)
  select
    p_target_user_id,
    null,
    action,
    usage_date,
    sum(count)::integer,
    min(created_at),
    now()
  from public.usage_limits
  where user_id = p_source_user_id
     or (v_source.anonymous_id is not null and anonymous_id = v_source.anonymous_id)
  group by action, usage_date
  on conflict (user_id, action, usage_date)
  do update set
    count = public.usage_limits.count + excluded.count,
    updated_at = now();

  delete from public.usage_limits
  where user_id = p_source_user_id
     or (v_source.anonymous_id is not null and anonymous_id = v_source.anonymous_id);

  insert into public.user_entitlements (user_id, report_id, type, source_payment_id, metadata, expires_at, created_at)
  select p_target_user_id, report_id, type, source_payment_id, metadata, expires_at, created_at
  from public.user_entitlements
  where user_id = p_source_user_id
  on conflict (user_id, report_id, type) do nothing;

  delete from public.user_entitlements
  where user_id = p_source_user_id;

  update public.user_subscriptions
    set user_id = p_target_user_id
  where user_id = p_source_user_id;

  update public.ai_generations
    set user_id = p_target_user_id
  where user_id = p_source_user_id;

  update public.credit_transactions
    set user_id = p_target_user_id
  where user_id = p_source_user_id;

  update public.app_users
    set
      email = null,
      external_id = null,
      anonymous_id = null,
      auth_provider_user_id = null
  where id = p_source_user_id;

  update public.app_users
    set
      credits_balance = coalesce(v_target.credits_balance, 0) + coalesce(v_source.credits_balance, 0),
      anonymous_id = coalesce(v_target.anonymous_id, v_source.anonymous_id),
      creem_customer_id = coalesce(v_target.creem_customer_id, v_source.creem_customer_id),
      last_ip = coalesce(v_target.last_ip, v_source.last_ip),
      last_country = coalesce(v_target.last_country, v_source.last_country),
      metadata = coalesce(v_source.metadata, '{}'::jsonb) || coalesce(v_target.metadata, '{}'::jsonb) || jsonb_build_object('mergedSourceUserId', p_source_user_id::text),
      created_at = least(v_target.created_at, v_source.created_at),
      last_seen_at = greatest(v_target.last_seen_at, v_source.last_seen_at),
      updated_at = now()
  where id = p_target_user_id
  returning * into v_target;

  delete from public.app_users
  where id = p_source_user_id;

  return v_target;
end;
$$;
