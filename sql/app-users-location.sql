alter table public.app_users add column if not exists last_ip text;
alter table public.app_users add column if not exists last_country text;

create index if not exists app_users_last_ip_idx on public.app_users (last_ip);
create index if not exists app_users_last_country_idx on public.app_users (last_country);
