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
