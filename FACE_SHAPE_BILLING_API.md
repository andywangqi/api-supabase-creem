# Face Shape Detector Billing API Plan

本文档描述后端需要新增的业务能力，基于当前 `api-supabase-creem` 项目：

- Supabase 继续作为数据库
- Creem 继续负责 checkout / webhook
- credits 继续复用现有 `adjustUserCredits`
- 登录暂时由前端接 Supabase Google OAuth 完成
- 后端只接收并保存 Supabase 登录用户信息

## 1. 商业规则

### 用户类型

| 用户类型 | 脸型检测 | 完整报告 | AI 妆容/发型生成 |
| --- | ---: | --- | --- |
| 匿名免费用户 | 3 次/天 | 不解锁 | 不可用 |
| Google 登录免费用户 | 3 次/天 | 不解锁 | 不可用 |
| 单次购买用户 | 3 次/天 | 解锁当前 report | 使用赠送 credits |
| Pro 订阅用户 | 前端显示无限，后端 50 次/天 | 所有 report 解锁 | 每月 150 credits |
| Studio 订阅用户 | 前端显示无限，后端 200 次/天 | 所有 report 解锁 | 每月 500 credits |

### 产品方案

| planKey | 类型 | 价格 | 权益 |
| --- | --- | ---: | --- |
| `full_report` | 一次性 | $6.99 | 解锁当前 report + 20 credits |
| `credits_50` | 一次性 | $4.99 | +50 credits |
| `credits_120` | 一次性 | $9.99 | +120 credits |
| `credits_300` | 一次性 | $19.99 | +300 credits |
| `pro_monthly` | 订阅 | $9.99/月 | 所有 report 解锁 + 每月 150 credits |
| `studio_monthly` | 订阅 | $19.99/月 | 所有 report 解锁 + 每月 500 credits |

重要：订阅用户不是无限 AI 生成，AI 生成永远扣 credits。

## 2. 后端新增环境变量

在 `.env.example` 增加：

```env
CREEM_PRODUCT_FULL_REPORT_ID=prod_xxx
CREEM_PRODUCT_CREDITS_50_ID=prod_xxx
CREEM_PRODUCT_CREDITS_120_ID=prod_xxx
CREEM_PRODUCT_CREDITS_300_ID=prod_xxx
CREEM_PRODUCT_PRO_MONTHLY_ID=prod_xxx
CREEM_PRODUCT_STUDIO_MONTHLY_ID=prod_xxx

SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

`SUPABASE_JWT_SECRET` 用于后端校验前端传来的 Supabase Google 登录 JWT。

如果初期不想校验 JWT，也可以先只保存前端传来的用户信息，但生产环境必须校验。

## 3. 新增数据表

### 3.1 face_reports

保存每次脸型检测结果。

```sql
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

create index if not exists face_reports_user_created_at_idx on public.face_reports (user_id, created_at desc);
create index if not exists face_reports_anonymous_created_at_idx on public.face_reports (anonymous_id, created_at desc);
```

### 3.2 usage_limits

限制免费用户每天检测次数。

```sql
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
```

建议新增 RPC `increment_usage_limit`，用数据库事务保证并发安全。

### 3.3 user_entitlements

记录一次性购买解锁的 report。

```sql
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
```

### 3.4 user_subscriptions

记录订阅状态。

```sql
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

create index if not exists user_subscriptions_user_status_idx on public.user_subscriptions (user_id, status);
```

### 3.5 ai_generations

记录 AI try-on 生成。

```sql
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
```
/*******************api 文档*******************/
## 4. Supabase Google 登录接入

前端用 Supabase Google OAuth 登录后，把 Supabase user 传给后端。

### 4.1 接口

```http
POST /api/auth/supabase
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
Cookie: anon_user_id=<anonymous_id>

{
  "id": "supabase-user-id",
  "email": "user@example.com",
  "name": "User Name",
  "avatarUrl": "https://..."
}
```

### 4.2 后端逻辑

1. 读取 `Authorization: Bearer <token>`
2. 校验 Supabase JWT
3. 从 JWT 取 `sub`、`email`
4. 如果当前有匿名 cookie，则把匿名用户升级为登录用户
5. 写入/更新 `app_users`
6. 返回当前用户、credits、subscription

### 4.3 app_users 建议新增字段

```sql
alter table public.app_users add column if not exists auth_provider text;
alter table public.app_users add column if not exists auth_provider_user_id text unique;
alter table public.app_users add column if not exists avatar_url text;
```

保存规则：

```text
auth_provider = 'supabase_google'
auth_provider_user_id = Supabase user id / JWT sub
email = Supabase email
name = Google profile name
avatar_url = Google avatar
is_anonymous = false
```

## 5. 新增 API

### 5.1 检测次数检查

```http
POST /api/face/detect/allow
Content-Type: application/json
Cookie: anon_user_id=<id>
```

返回：

```json
{
  "allowed": true,
  "plan": "free",
  "limit": 3,
  "used": 1,
  "remaining": 2
}
```

限制规则：

```js
free: 3
full_report: 3
pro_monthly: 50
studio_monthly: 200
```

### 5.2 保存检测报告

```http
POST /api/face/reports
Content-Type: application/json
Cookie: anon_user_id=<id>

{
  "faceShape": "oblong",
  "confidence": 0.4889,
  "scores": {},
  "characteristics": {},
  "freeResult": {},
  "fullResult": {},
  "imageUrl": "optional"
}
```

返回：

```json
{
  "report": {
    "id": "uuid",
    "faceShape": "oblong",
    "unlocked": false
  }
}
```

### 5.3 获取报告

```http
GET /api/face/reports/:id
Cookie: anon_user_id=<id>
```

免费用户返回：

```json
{
  "report": {
    "id": "uuid",
    "faceShape": "oblong",
    "freeResult": {},
    "fullResult": null,
    "unlocked": false
  }
}
```

已解锁或订阅用户返回：

```json
{
  "report": {
    "id": "uuid",
    "faceShape": "oblong",
    "freeResult": {},
    "fullResult": {},
    "unlocked": true,
    "unlockSource": "subscription"
  }
}
```

### 5.4 当前用户权益

```http
GET /api/site/access?reportId=<report_id>
```

返回：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "creditsBalance": 150
  },
  "subscription": {
    "active": true,
    "planKey": "pro_monthly",
    "currentPeriodEnd": "2026-06-10T00:00:00.000Z"
  },
  "report": {
    "unlocked": true,
    "source": "subscription"
  }
}
```

### 5.5 创建 Checkout

建议新增业务包装接口，不让前端直接调用通用 `/api/creem/checkout`。

```http
POST /api/site/checkout
Content-Type: application/json
Cookie: anon_user_id=<id>

{
  "planKey": "full_report",
  "reportId": "uuid",
  "email": "user@example.com"
}
```

后端根据 `planKey` 映射 Creem product id，不允许前端传价格和 productId。

Creem metadata 必须包含：

```json
{
  "planKey": "full_report",
  "reportId": "uuid",
  "userId": "app_users.id",
  "anonymousId": "anon id"
}
```

### 5.6 AI Try-On

```http
POST /api/ai/try-on
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{
  "reportId": "uuid",
  "type": "hairstyle",
  "styleId": "layered_cut"
}
```

扣费规则：

```js
makeup: 8
hairstyle: 10
hd: 20
```

流程：

1. 校验登录用户
2. 校验 report 权限
3. 校验 credits 足够
4. 创建 `ai_generations` pending
5. 调 AI 生成
6. 成功后扣 credits
7. 更新 `ai_generations.result_url`
8. 返回图片 URL 和 creditsBalance

## 6. Creem Webhook 新增逻辑

当前 webhook 只写 `payments`。需要在 `insertPayment` 成功后，根据 metadata 分发权益。

### 6.1 一次性完整报告

当 `metadata.planKey = full_report`：

```text
- 写 payments
- 给用户 +20 credits
- 写 user_entitlements(type='full_report', report_id=metadata.reportId)
```

credits 幂等 key：

```text
payment:<payment_id>:full_report_bonus
```

### 6.2 credits 包

当 `metadata.planKey = credits_50 / credits_120 / credits_300`：

```text
- 写 payments
- 给用户加对应 credits
```

credits 幂等 key：

```text
payment:<payment_id>:credits_pack
```

### 6.3 订阅扣款成功

当 webhook 是 `subscription.paid` 且 `planKey = pro_monthly / studio_monthly`：

```text
- upsert user_subscriptions
- status = active
- 给用户发本周期 credits
```

发 credits：

```text
pro_monthly: 150
studio_monthly: 500
```

幂等 key：

```text
subscription:<creem_subscription_id>:<current_period_start>:credits
```

### 6.4 订阅取消/失败

```text
subscription.canceled:
- cancel_at_period_end = true
- status 保持 active 到 current_period_end

subscription.expired / subscription.paused:
- status = expired / paused

payment.failed / subscription.payment_failed:
- status = past_due
```

## 7. 后端文件建议拆分

建议新增：

```text
src/products.js       商品 planKey 配置
src/auth-supabase.js  Supabase JWT 校验 + 用户保存
src/reports.js        face_reports / entitlement 业务
src/subscriptions.js  user_subscriptions 业务
src/usage.js          每日检测次数限制
src/generations.js    AI try-on 生成记录和扣 credits
```

修改：

```text
src/app.js            挂载新增路由
src/creem.js          webhook 分发权益
src/supabase.js       增加通用 insert/update helper 可选
src/config.js         增加新 env
sql/schema.sql        增加新表和索引
README.md             补接口说明
```

## 8. 前端调用顺序

### 免费检测

```text
1. POST /api/site/session
2. POST /api/face/detect/allow
3. 前端执行脸型检测
4. POST /api/face/reports
5. GET /api/face/reports/:id
```

### Google 登录

```text
1. 前端 Supabase Google OAuth 登录
2. 拿到 access_token 和 user
3. POST /api/auth/supabase
4. 后端保存/合并用户
```

### 解锁完整报告

```text
1. 如果未登录，先 Google 登录或输入邮箱
2. POST /api/site/checkout { planKey: 'full_report', reportId }
3. 跳转 Creem checkout
4. Creem webhook 写 payment + entitlement + credits
5. 前端支付成功页轮询 GET /api/site/access?reportId=xxx
```

### 订阅

```text
1. 用户 Google 登录
2. POST /api/site/checkout { planKey: 'pro_monthly' }
3. Creem webhook 写 subscription + 发 monthly credits
4. GET /api/site/access 返回 subscription.active = true
```

### AI 生成

```text
1. 用户必须登录
2. POST /api/ai/try-on
3. 后端校验 credits
4. 调 AI
5. 扣 credits
6. 返回 resultUrl
```

## 9. 最小开发顺序

建议按这个顺序做：

1. SQL：新增表和索引
2. `src/products.js`：固定 planKey 配置
3. `POST /api/auth/supabase`：接收并保存 Google 登录用户
4. `POST /api/face/detect/allow`：免费 3 次/天限制
5. `POST /api/face/reports` + `GET /api/face/reports/:id`
6. `POST /api/site/checkout`：用 planKey 创建 Creem checkout
7. `src/creem.js`：webhook 发 entitlement / credits / subscription
8. `GET /api/site/access`
9. `POST /api/ai/try-on`
10. 后台 admin 再补 subscription / report / generation 列表

## 10. 关键安全点

- 前端不能传 `productId`、价格、credits 数量
- 所有权益只在 webhook 确认支付成功后发放
- credits 扣减必须由后端完成
- AI try-on 必须登录
- 订阅用户也要扣 credits
- Supabase service role key 只放后端
- Supabase access token 生产环境必须校验
- 检测次数限制要用数据库原子递增，避免并发绕过
