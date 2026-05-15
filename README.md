# API + Supabase + Creem

用于 Vercel 部署的轻量 Node.js 后端，数据库使用 Supabase，支付使用 Creem。

前端接口文档见 [FRONTEND_API.md](./FRONTEND_API.md)，后台接口文档见 [ADMIN_API.md](./ADMIN_API.md)。

## 功能

- 后台页面：`/admin`，必须先登录
- 用户统计：总用户数、当天用户数
- 收入统计：当天收入、总收入、每日收入
- 前端网站初始化：自动创建匿名用户
- Face Shape Detector 计费：检测次数限制、报告保存、报告解锁、订阅权益
- 积分系统：查询积分、增加积分、扣减积分、积分流水
- Supabase Google OAuth 用户接入
- 后台用户列表：显示注册时间、剩余积分，并支持手动加减积分
- Blog 管理：后台上传、编辑、列表；前台公开读取
- Creem：创建 Checkout、接收 Webhook 入账

## 项目结构

```text
api/[...path].js          Vercel Function 入口
src/views/admin.html      后台页面模板
src/views/admin-login.html 后台登录页面模板
public/admin.js           后台交互逻辑
public/admin-login.js     后台登录逻辑
src/app.js                API 路由
src/site.js               匿名登录/用户初始化
src/auth-supabase.js      Supabase Google OAuth token 处理
src/products.js           商品和 planKey 配置
src/reports.js            脸型检测报告和解锁权益
src/usage.js              每日检测次数限制
src/subscriptions.js      订阅状态
src/generations.js        AI try-on 生成记录和扣积分
src/billing.js            业务 checkout 和支付权益分发
src/credits.js            积分业务
src/blog.js               Blog 业务
src/creem.js              Creem 支付与 Webhook
src/supabase.js           Supabase REST/RPC 封装
sql/schema.sql            Supabase 建表与 RPC
```

## 环境变量

复制 `.env.example` 为 `.env`，本地运行或 Vercel 环境变量都使用同一套配置。

```env
PORT=3000
APP_BASE_URL=https://admin.faceshapedetector.store
APP_TIMEZONE_OFFSET_MINUTES=480
DEFAULT_CURRENCY=USD
APP_ANON_COOKIE_NAME=anon_user_id
APP_COOKIE_DOMAIN=

ADMIN_API_KEY=change-me-long-random-admin-key

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_SCHEMA=public

CREEM_API_KEY=your-creem-api-key
CREEM_WEBHOOK_SECRET=your-creem-webhook-secret
CREEM_PRODUCT_ID=your-creem-product-id
CREEM_TEST_MODE=true
CREEM_PRODUCT_FULL_REPORT_ID=prod_xxx
CREEM_PRODUCT_CREDITS_50_ID=prod_xxx
CREEM_PRODUCT_CREDITS_120_ID=prod_xxx
CREEM_PRODUCT_CREDITS_300_ID=prod_xxx
CREEM_PRODUCT_PRO_MONTHLY_ID=prod_xxx
CREEM_PRODUCT_STUDIO_MONTHLY_ID=prod_xxx

SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 只能放服务端或 Vercel 环境变量，不能暴露到前端。
- `ADMIN_API_KEY` 是后台登录密码。访问 `/admin` 会先跳转到 `/admin/login`，登录成功后写入 HttpOnly `admin_session` Cookie。
- `APP_TIMEZONE_OFFSET_MINUTES=480` 表示 UTC+8，用于当天用户和当天收入统计。
- `CREEM_TEST_MODE=true` 使用 Creem 测试环境，上线后改为 `false`。
- `CREEM_PRODUCT_*` 是后端固定商品映射，前端不能传价格或 Creem product id。
- `SUPABASE_JWT_SECRET` 用于校验前端传入的 Supabase access token。

## Supabase 初始化

在 Supabase SQL Editor 执行：

```text
sql/schema.sql
```

会创建：

- `app_users`：用户表，包含匿名用户、邮箱用户、积分余额、最近 IP 和国家
- `payments`：支付入账表
- `credit_transactions`：积分流水表
- `blog_posts`：Blog 表
- `face_reports`：脸型检测报告
- `usage_limits`：每日检测次数
- `user_entitlements`：一次性购买的报告解锁权益
- `user_subscriptions`：订阅状态
- `ai_generations`：AI try-on 生成记录
- `get_admin_metrics`：后台统计 RPC，用户数只统计已识别/已登录用户，不统计匿名初始化用户
- `get_daily_revenue`：每日收入 RPC
- `adjust_user_credits`：积分加减 RPC
- `increment_usage_limit`：每日检测次数原子递增 RPC

如果已经执行过旧版本 SQL，也可以再次执行，脚本包含 `if not exists` 和增量字段补齐。

## 本地运行

```bash
node src/server.js
```

打开后台：

```text
http://localhost:3000/admin
```

未登录会跳转到：

```text
http://localhost:3000/admin/login
```

运行测试：

```bash
node --test --test-isolation=none
```

## Vercel 部署

1. 推送代码到 GitHub。
2. 在 Vercel 导入仓库。
3. 在 Vercel Project Settings -> Environment Variables 添加 `.env.example` 中的变量。
4. 部署后访问 `/admin`。
5. 在 Creem 后台配置 Webhook：

```text
https://admin.faceshapedetector.store/api/creem/webhook
```

Vercel 路由和请求方式：

- `GET /admin`：后台页面，未登录跳转到 `/admin/login`
- `GET /admin/login`：后台登录页面
- `POST /api/admin/login`：后台登录 API
- `GET /api/admin/session`：后台登录态
- `POST /api/admin/logout`：后台退出登录
- `GET /health` 或 `GET /api/health`：健康检查
- `GET /api/site/session`、`POST /api/site/session`：前端初始化/匿名登录
- `POST /api/auth/supabase`：保存 Supabase Google 登录用户
- `POST /api/face/detect/allow`：检测次数限制
- `POST /api/face/reports`、`GET /api/face/reports/:id`：脸型检测报告
- `GET /api/site/access`：当前用户权益
- `POST /api/site/checkout`：按 planKey 创建 Creem Checkout
- `POST /api/ai/try-on`：AI try-on 扣积分和生成记录
- `GET /api/site/credits`、`POST /api/site/credits/deduct`：前端积分
- `GET /api/admin/metrics`：后台统计
- `GET /api/admin/users`、`GET /api/admin/users/:id/credits`、`POST /api/admin/users/:id/credits/add`、`POST /api/admin/users/:id/credits/deduct`：后台用户和积分管理
- `GET /api/admin/blogs`、`POST /api/admin/blogs`、`PATCH /api/admin/blogs/:id`、`DELETE /api/admin/blogs/:id`：后台 Blog 管理
- `GET /api/blogs`、`GET /api/blogs/:slug`：前台公开 Blog API
- `POST /api/users`：内部用户写入
- `POST /api/creem/checkout`、`POST /api/creem/webhook`：Creem 支付
- `GET /payment-success`：支付成功页

## API 鉴权

后台页面访问流程：

1. 打开 `/admin`。
2. 未登录会跳转到 `/admin/login`。
3. 输入 `ADMIN_API_KEY`，页面会调用 `POST /api/admin/login` 登录。
4. 登录成功后浏览器会保存 HttpOnly `admin_session` Cookie，后台页面请求自动带上登录态。

脚本或服务端直接调用后台 API 时，仍可传 `ADMIN_API_KEY`，二选一：

```http
Authorization: Bearer <ADMIN_API_KEY>
```

或：

```http
x-admin-key: <ADMIN_API_KEY>
```

前端用户 API 使用 `anon_user_id` Cookie。首次调用 `/api/site/session` 时会生成当前用户唯一 UUID，并用同一个 UUID 写入 `app_users.id` 和 `app_users.anonymous_id`。登录后不会新建另一条用户记录，而是把 email、昵称、Supabase 登录信息合并到当前 UUID 用户上；如果已存在旧登录用户，会把旧用户的积分、报告、订阅、权益等关联数据合并到当前 UUID。前端必须复用同一个匿名身份：所有请求使用 `credentials: 'include'`；如果浏览器环境不能稳定发送 Cookie，就保存 `/api/site/session` 返回的 `anonymousId`，后续请求通过 `x-anonymous-id` 或 body 传回后端。

## 健康检查

```http
GET /health
```

返回：

```json
{
  "ok": true,
  "service": "api-supabase-creem",
  "time": "2026-05-10T00:00:00.000Z"
}
```

## 前端用户初始化

网站打开时调用：

```http
POST /api/site/session
Content-Type: application/json
```

前端示例：

```js
const response = await fetch('/api/site/session', {
  method: 'POST',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});

const data = await response.json();
```

首次访问会创建匿名用户：

```json
{
  "user": {
    "id": "uuid",
    "anonymousId": "uuid",
    "email": null,
    "name": null,
    "isAnonymous": true,
    "creditsBalance": 0,
    "createdAt": "2026-05-10T00:00:00.000Z",
    "lastSeenAt": "2026-05-10T00:00:00.000Z"
  },
  "anonymousId": "uuid",
  "isNewUser": true,
  "mode": "anonymous"
}
```

如果前端已有邮箱，可用同一个接口把匿名用户升级为正式用户：

```http
POST /api/site/session
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "User Name"
}
```

## Supabase Google 登录

前端完成 Supabase Google OAuth 后，把 access token 和 user 信息传给后端：

```http
POST /api/auth/supabase
Authorization: Bearer <supabase_access_token>
Content-Type: application/json
Cookie: anon_user_id=<anonymous_id>

{
  "id": "supabase-user-id",
  "email": "user@example.com",
  "name": "User Name",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```

后端会：

- 校验 Supabase JWT（配置 `SUPABASE_JWT_SECRET` 后启用签名校验）
- 将当前匿名用户升级成 Google 登录用户
- 保存 `auth_provider='supabase_google'`
- 返回用户、积分和订阅状态

## Face Shape Detector API

### 检测次数检查

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

- 免费/单次购买：每天 3 次
- `pro_monthly`：每天 50 次
- `studio_monthly`：每天 200 次

### 保存检测报告

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
  "imageUrl": "https://example.com/image.jpg"
}
```

### 获取检测报告

```http
GET /api/face/reports/:id
Cookie: anon_user_id=<id>
```

未解锁时 `fullResult` 返回 `null`。已购买当前报告或有有效订阅时返回完整报告。

### 当前用户权益

```http
GET /api/site/access?reportId=<report_id>
Cookie: anon_user_id=<id>
```

返回用户积分、订阅状态，以及指定报告是否已解锁。

### 按 planKey 创建 Checkout

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

可用 `planKey`：

- `full_report`：解锁当前报告 + 20 credits
- `credits_50`：增加 50 credits
- `credits_120`：增加 120 credits
- `credits_300`：增加 300 credits
- `pro_monthly`：订阅，每月 150 credits，每天 50 次检测
- `studio_monthly`：订阅，每月 500 credits，每天 200 次检测

前端只传 `planKey`，后端映射 Creem product id。

### AI Try-On

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

规则：

- 必须是 Supabase Google 登录用户
- 必须已解锁该报告，或有有效订阅
- 订阅用户也要扣 credits
- `makeup` 扣 8 credits
- `hairstyle` 扣 10 credits
- `hd` 扣 20 credits

## 积分 API

### 前端查询当前用户积分

```http
GET /api/site/credits
Cookie: anon_user_id=<id>
```

返回：

```json
{
  "user": {
    "userId": "uuid",
    "email": null,
    "anonymousId": "uuid",
    "creditsBalance": 100,
    "createdAt": "2026-05-10T00:00:00.000Z"
  }
}
```

### 前端扣减当前用户积分

```http
POST /api/site/credits/deduct
Content-Type: application/json
Cookie: anon_user_id=<id>

{
  "amount": 1,
  "reason": "feature usage",
  "idempotencyKey": "optional-unique-key"
}
```

默认不允许扣成负数。

### 后台用户列表

```http
GET /api/admin/users?limit=50&search=user@example.com
x-admin-key: <ADMIN_API_KEY>
```

返回：

```json
{
  "users": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "anonymousId": "anon-id",
      "name": "User Name",
      "isAnonymous": false,
      "creditsBalance": 100,
      "lastIp": "203.0.113.10",
      "lastCountry": "US",
      "createdAt": "2026-05-10T00:00:00.000Z",
      "lastSeenAt": "2026-05-10T01:00:00.000Z"
    }
  ]
}
```

### 后台查询单个用户积分

```http
GET /api/admin/users/:id/credits
x-admin-key: <ADMIN_API_KEY>
```

### 后台增加积分

```http
POST /api/admin/users/:id/credits/add
x-admin-key: <ADMIN_API_KEY>
Content-Type: application/json

{
  "amount": 100,
  "reason": "manual top up",
  "idempotencyKey": "optional-unique-key"
}
```

### 后台扣减积分

```http
POST /api/admin/users/:id/credits/deduct
x-admin-key: <ADMIN_API_KEY>
Content-Type: application/json

{
  "amount": 10,
  "reason": "manual deduction"
}
```

返回：

```json
{
  "credits": {
    "userId": "uuid",
    "creditsBalance": 90,
    "transactionId": "uuid"
  }
}
```

## 后台统计 API

```http
GET /api/admin/metrics?days=30
x-admin-key: <ADMIN_API_KEY>
```

返回总用户、当天用户、当天收入、总收入、每日收入。

收入金额使用最小货币单位保存，例如 USD cents。前端展示时会除以 100。

## Blog API

### 后台创建或更新 Blog

```http
POST /api/admin/blogs
x-admin-key: <ADMIN_API_KEY>
Content-Type: application/json

{
  "title": "First post",
  "slug": "first-post",
  "excerpt": "Short summary",
  "content": "Full blog content",
  "coverImageUrl": "https://example.com/cover.jpg",
  "authorName": "Admin",
  "status": "published"
}
```

`status` 可选：

- `draft`
- `published`

后台其他接口：

```http
GET /api/admin/blogs?limit=50
PATCH /api/admin/blogs/:id
DELETE /api/admin/blogs/:id
```

### 前台公开读取 Blog

```http
GET /api/blogs?limit=20&offset=0
GET /api/blogs/:slug
```

只返回 `published` 状态文章。

Blog 返回对象包含 `schema` JSON-LD，类型为 `BlogPosting`，字段包含 `headline`、`description`、`datePublished`、`dateModified`、`image`、`author`、`publisher`。

## Creem 支付 API

### 创建 Checkout

```http
POST /api/creem/checkout
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "User Name",
  "productId": "prod_xxx",
  "anonymousId": "optional-anon-id"
}
```

返回：

```json
{
  "checkoutId": "checkout_xxx",
  "checkoutUrl": "https://...",
  "requestId": "uuid"
}
```

前端拿到 `checkoutUrl` 后跳转到支付页。

### Creem Webhook

```http
POST /api/creem/webhook
```

Webhook 会校验签名，并把支付结果写入 `payments`。订阅场景下收入使用 `subscription.paid` 记账，避免和 `checkout.completed` 重复计算。

支付成功后会根据 metadata 自动分发权益：

- `full_report`：解锁当前 report，并赠送 20 credits
- `credits_50` / `credits_120` / `credits_300`：发放对应 credits
- `pro_monthly`：写入订阅状态，并按周期发放 150 credits
- `studio_monthly`：写入订阅状态，并按周期发放 500 credits

订阅取消、过期、暂停、扣款失败事件会更新 `user_subscriptions` 状态。

## 手动 Git 推送

当前项目目录：

```text
D:\work\web\api-supabase-creem
```

推送到 GitHub：

```powershell
cd "D:\work\web\api-supabase-creem"
git push -u origin main
```

如果提示权限不足，切换到有 `andywangqi/api-supabase-creem` 权限的 GitHub 账号后再推。
