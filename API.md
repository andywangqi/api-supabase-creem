# API 文档

本文档覆盖 `api-supabase-creem` 当前后端接口。部署到 Vercel 后，所有接口都以你的域名为前缀，例如：

```text
https://your-domain.com
```

本地开发默认：

```text
http://localhost:3000
```

## 通用规则

### 请求格式

- JSON 请求统一使用 `Content-Type: application/json`。
- 需要保持用户身份的前端请求必须带 `credentials: 'include'`。
- 用户侧匿名身份使用 HttpOnly Cookie：`anon_user_id`，实际名字可由 `APP_ANON_COOKIE_NAME` 配置。
- 后台页面登录使用 HttpOnly Cookie：`admin_session`。

### 错误格式

失败时统一返回：

```json
{
  "error": {
    "message": "Unauthorized",
    "details": {}
  }
}
```

常见状态码：

| 状态码 | 含义 |
| ---: | --- |
| `200` | 成功 |
| `201` | 创建成功 |
| `400` | 请求参数错误 |
| `401` | 未登录或鉴权失败 |
| `403` | 无权限 |
| `404` | 资源不存在 |
| `413` | 请求体过大 |
| `500` | 服务端配置或运行错误 |

## 鉴权

### 前端用户鉴权

网站首次打开调用 `/api/site/session`。如果数据库没有该用户，后端会创建匿名用户，并写入 `anon_user_id` Cookie。

前端请求示例：

```js
await fetch('/api/site/session', {
  method: 'POST',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});
```

### Supabase Google 登录

前端完成 Supabase OAuth 后，把 Supabase access token 放到请求头：

```http
Authorization: Bearer <supabase_access_token>
```

如果配置了 `SUPABASE_JWT_SECRET`，后端会校验 JWT 签名和过期时间。

### 后台鉴权

后台页面：

1. 打开 `/admin`。
2. 未登录会跳转 `/admin/login`。
3. 输入 `ADMIN_API_KEY`。
4. 登录成功后写入 `admin_session` Cookie，有效期 7 天。

后台 API 支持两种方式：

```http
Authorization: Bearer <ADMIN_API_KEY>
```

或：

```http
x-admin-key: <ADMIN_API_KEY>
```

浏览器后台页面则自动带 `admin_session` Cookie，不需要在前端保存 `ADMIN_API_KEY`。

## 产品和积分

### planKey

| planKey | 类型 | 价格 | 权益 |
| --- | --- | ---: | --- |
| `full_report` | 一次性 | `$6.99` | 解锁当前 report，赠送 20 credits |
| `credits_50` | 一次性 | `$4.99` | 增加 50 credits |
| `credits_120` | 一次性 | `$9.99` | 增加 120 credits |
| `credits_300` | 一次性 | `$19.99` | 增加 300 credits |
| `pro_monthly` | 订阅 | `$9.99/月` | 每月 150 credits，每天 50 次检测，解锁所有 report |
| `studio_monthly` | 订阅 | `$19.99/月` | 每月 500 credits，每天 200 次检测，解锁所有 report |

### AI 扣费

| type | credits |
| --- | ---: |
| `makeup` | 8 |
| `hairstyle` | 10 |
| `hd` | 20 |

## 健康检查

### `GET /health`

也支持 `GET /api/health`。

响应：

```json
{
  "ok": true,
  "service": "api-supabase-creem",
  "time": "2026-05-13T00:00:00.000Z"
}
```

## 用户 Session API

### `GET /api/site/session`

读取或创建当前匿名用户。

认证：不需要。

响应头：

```http
Set-Cookie: anon_user_id=<id>; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax
x-anonymous-id: <id>
```

响应：

```json
{
  "user": {
    "id": "uuid",
    "externalId": null,
    "anonymousId": "uuid",
    "email": null,
    "name": null,
    "isAnonymous": true,
    "creditsBalance": 0,
    "createdAt": "2026-05-13T00:00:00.000Z",
    "lastSeenAt": "2026-05-13T00:00:00.000Z"
  },
  "anonymousId": "uuid",
  "isNewUser": true,
  "mode": "anonymous"
}
```

### `POST /api/site/session`

创建匿名用户，或用邮箱把匿名用户升级成正式用户。

认证：不需要。

请求：

```json
{
  "email": "user@example.com",
  "name": "User Name",
  "userId": "optional-external-id",
  "metadata": {
    "source": "website"
  }
}
```

说明：

- `email` 可选。不传时创建或刷新匿名用户。
- 也支持 `anonymousId` / `anonymous_id`，以及请求头 `x-anonymous-id`。

响应同 `GET /api/site/session`。

## Supabase 登录 API

### `POST /api/auth/supabase`

保存 Supabase Google 登录用户，并把当前匿名用户升级为登录用户。

认证：推荐传 Supabase access token。生产环境配置 `SUPABASE_JWT_SECRET` 后必须传。

请求头：

```http
Authorization: Bearer <supabase_access_token>
Cookie: anon_user_id=<anonymous_id>
```

请求：

```json
{
  "id": "supabase-user-id",
  "email": "user@example.com",
  "name": "User Name",
  "avatarUrl": "https://example.com/avatar.png"
}
```

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "avatarUrl": "https://example.com/avatar.png",
    "creditsBalance": 0,
    "createdAt": "2026-05-13T00:00:00.000Z",
    "lastSeenAt": "2026-05-13T00:00:00.000Z"
  },
  "subscription": {
    "active": false
  }
}
```

## 积分 API

### `GET /api/site/credits`

查询当前前端用户积分。

认证：需要 `anon_user_id` Cookie 或 `x-anonymous-id`。

响应：

```json
{
  "user": {
    "userId": "uuid",
    "email": null,
    "anonymousId": "uuid",
    "name": null,
    "isAnonymous": true,
    "creditsBalance": 100,
    "createdAt": "2026-05-13T00:00:00.000Z",
    "lastSeenAt": "2026-05-13T00:00:00.000Z"
  }
}
```

### `POST /api/site/credits/deduct`

扣减当前前端用户积分。

认证：需要 `anon_user_id` Cookie 或 `x-anonymous-id`。

请求：

```json
{
  "amount": 1,
  "source": "feature_usage",
  "reason": "detect face",
  "metadata": {},
  "idempotencyKey": "optional-unique-key"
}
```

响应：

```json
{
  "user": {
    "userId": "uuid",
    "creditsBalance": 99,
    "transactionId": "uuid"
  }
}
```

## Face Shape API

### `POST /api/face/detect/allow`

检查并递增当天脸型检测次数。

认证：不需要。没有用户时会自动创建匿名用户。

响应头：可能返回 `Set-Cookie: anon_user_id=<id>`。

响应：

```json
{
  "allowed": true,
  "plan": "free",
  "limit": 3,
  "used": 1,
  "remaining": 2
}
```

说明：

- 免费用户每天 3 次。
- `pro_monthly` 每天 50 次。
- `studio_monthly` 每天 200 次。

### `POST /api/face/reports`

保存脸型检测报告。

认证：不需要。没有用户时会自动创建匿名用户。

请求：

```json
{
  "faceShape": "oblong",
  "confidence": 0.92,
  "scores": {
    "oblong": 0.92,
    "oval": 0.63
  },
  "characteristics": {
    "jawline": "soft"
  },
  "freeResult": {
    "summary": "Your face shape is oblong."
  },
  "fullResult": {
    "recommendations": []
  },
  "imageUrl": "https://example.com/image.jpg",
  "metadata": {}
}
```

响应：

```json
{
  "report": {
    "id": "uuid",
    "userId": "uuid",
    "anonymousId": "uuid",
    "faceShape": "oblong",
    "confidence": 0.92,
    "scores": {},
    "characteristics": {},
    "freeResult": {},
    "fullResult": null,
    "imageUrl": "https://example.com/image.jpg",
    "unlocked": false,
    "unlockSource": null,
    "createdAt": "2026-05-13T00:00:00.000Z"
  }
}
```

### `GET /api/face/reports/:id`

获取当前用户自己的报告。

认证：需要 `anon_user_id` Cookie、`x-anonymous-id`，或 Supabase Bearer token。

响应：

```json
{
  "report": {
    "id": "uuid",
    "faceShape": "oblong",
    "freeResult": {},
    "fullResult": null,
    "unlocked": false,
    "unlockSource": null
  }
}
```

说明：

- 未解锁时 `fullResult` 为 `null`。
- 购买 `full_report` 或有有效订阅时，`fullResult` 返回完整内容。

### `GET /api/site/access?reportId=<report_id>`

查询当前用户权益、订阅和指定 report 解锁状态。

认证：不需要。没有用户时会自动创建匿名用户。

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "creditsBalance": 150
  },
  "subscription": {
    "id": "uuid",
    "planKey": "pro_monthly",
    "status": "active",
    "active": true,
    "detectLimit": 50,
    "currentPeriodStart": "2026-05-01T00:00:00.000Z",
    "currentPeriodEnd": "2026-06-01T00:00:00.000Z",
    "cancelAtPeriodEnd": false
  },
  "report": {
    "unlocked": true,
    "source": "subscription"
  }
}
```

## Checkout API

### `POST /api/site/checkout`

前端业务 checkout。前端只能传 `planKey`，不能传 Creem product id 或价格。

认证：不需要。没有用户时会自动创建匿名用户。

请求：

```json
{
  "planKey": "full_report",
  "reportId": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "successUrl": "https://your-domain.com/payment-success"
}
```

说明：

- `full_report` 必须传 `reportId`。
- `credits_50` / `credits_120` / `credits_300` / `pro_monthly` / `studio_monthly` 不需要 `reportId`。
- 后端会把 `planKey`、`reportId`、`userId`、`anonymousId` 写入 Creem metadata。

响应：

```json
{
  "checkoutId": "chk_xxx",
  "checkoutUrl": "https://checkout.creem.io/xxx",
  "planKey": "full_report",
  "requestId": "full_report:uuid:1760000000000"
}
```

### `POST /api/creem/checkout`

通用 Creem checkout。建议只给服务端或内部脚本使用，前端业务优先用 `/api/site/checkout`。

认证：当前未强制后台鉴权，生产环境不要暴露给不可信前端。

请求：

```json
{
  "productId": "prod_xxx",
  "email": "user@example.com",
  "name": "User Name",
  "userId": "optional-external-id",
  "anonymousId": "optional-anonymous-id",
  "requestId": "optional-request-id",
  "successUrl": "https://your-domain.com/payment-success",
  "metadata": {},
  "units": 1,
  "discountCode": "OPTIONAL"
}
```

响应：

```json
{
  "checkoutId": "chk_xxx",
  "checkoutUrl": "https://checkout.creem.io/xxx",
  "requestId": "request-id",
  "raw": {}
}
```

## AI Try-On API

### `POST /api/ai/try-on`

创建 AI try-on 生成记录并扣积分。

认证：必须传 Supabase Bearer token。

请求头：

```http
Authorization: Bearer <supabase_access_token>
```

请求：

```json
{
  "reportId": "uuid",
  "type": "makeup",
  "styleId": "natural",
  "resultUrl": "https://example.com/result.png",
  "metadata": {}
}
```

响应：

```json
{
  "generation": {
    "id": "uuid",
    "reportId": "uuid",
    "type": "makeup",
    "styleId": "natural",
    "creditsCost": 8,
    "status": "completed",
    "resultUrl": "https://example.com/result.png",
    "errorMessage": null,
    "creditsBalance": 142,
    "createdAt": "2026-05-13T00:00:00.000Z"
  }
}
```

说明：

- 必须拥有该 report。
- 必须已解锁完整报告。
- 积分不足会失败。

## Blog API

### `GET /api/blogs?limit=20&offset=0`

公开读取已发布 Blog 列表。

认证：不需要。

响应：

```json
{
  "blogs": [
    {
      "id": "uuid",
      "title": "First post",
      "slug": "first-post",
      "excerpt": "Short summary",
      "content": "Full blog content",
      "coverImageUrl": "https://example.com/cover.jpg",
      "authorName": "Admin",
      "status": "published",
      "publishedAt": "2026-05-13T00:00:00.000Z",
      "createdAt": "2026-05-13T00:00:00.000Z",
      "updatedAt": "2026-05-13T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/blogs/:slug`

公开读取单篇已发布 Blog。

认证：不需要。

响应：

```json
{
  "blog": {
    "id": "uuid",
    "title": "First post",
    "slug": "first-post",
    "content": "Full blog content",
    "status": "published"
  }
}
```

## 后台页面 API

### `GET /admin`

后台页面。

认证：需要 `admin_session` Cookie。未登录返回 `302 /admin/login`。

### `GET /admin/login`

后台登录页。

说明：已登录时返回 `302 /admin`。

### `GET /api/admin/session`

查询后台登录状态。

响应：

```json
{
  "authenticated": true
}
```

### `POST /api/admin/login`

后台登录。

请求：

```json
{
  "adminKey": "your-admin-api-key"
}
```

响应头：

```http
Set-Cookie: admin_session=<signed-token>; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800
```

响应：

```json
{
  "ok": true
}
```

### `POST /api/admin/logout`

后台退出。

响应：

```json
{
  "ok": true
}
```

## 后台统计 API

### `GET /api/admin/metrics?days=30`

查询后台统计。

认证：后台 API key 或 `admin_session` Cookie。

参数：

| 参数 | 默认 | 说明 |
| --- | ---: | --- |
| `days` | `30` | 每日收入天数，范围 1 到 120 |

响应：

```json
{
  "metrics": {
    "totalUsers": 1000,
    "todayUsers": 23,
    "todayRevenue": 1299,
    "totalRevenue": 99999,
    "currency": "USD",
    "localDate": "2026-05-13",
    "updatedAt": "2026-05-13T00:00:00.000Z"
  },
  "dailyRevenue": [
    {
      "date": "2026-05-13",
      "revenue": 1299,
      "paymentsCount": 3
    }
  ]
}
```

说明：金额使用最小货币单位，例如 USD cents。

## 后台用户和积分 API

### `GET /api/admin/users?limit=50&offset=0&search=user@example.com`

后台用户列表。

认证：后台 API key 或 `admin_session` Cookie。

响应：

```json
{
  "users": [
    {
      "userId": "uuid",
      "email": "user@example.com",
      "anonymousId": "uuid",
      "name": "User Name",
      "isAnonymous": false,
      "creditsBalance": 100,
      "createdAt": "2026-05-13T00:00:00.000Z",
      "lastSeenAt": "2026-05-13T00:00:00.000Z"
    }
  ]
}
```

### `GET /api/admin/users/:id/credits`

查询单个用户积分。

认证：后台 API key 或 `admin_session` Cookie。

响应：

```json
{
  "user": {
    "userId": "uuid",
    "email": "user@example.com",
    "anonymousId": "uuid",
    "creditsBalance": 100
  }
}
```

### `POST /api/admin/users/:id/credits/add`

后台增加积分。

认证：后台 API key 或 `admin_session` Cookie。

请求：

```json
{
  "amount": 100,
  "source": "admin_add",
  "reason": "manual top up",
  "metadata": {},
  "idempotencyKey": "optional-unique-key"
}
```

响应：

```json
{
  "credits": {
    "userId": "uuid",
    "creditsBalance": 200,
    "transactionId": "uuid"
  }
}
```

### `POST /api/admin/users/:id/credits/deduct`

后台扣减积分。

认证：后台 API key 或 `admin_session` Cookie。

请求：

```json
{
  "amount": 10,
  "source": "admin_deduct",
  "reason": "manual deduction",
  "allowNegative": false
}
```

响应：

```json
{
  "credits": {
    "userId": "uuid",
    "creditsBalance": 90,
    "transactionId": "uuid"
  }
}
```

### `POST /api/admin/users/:id/credits`

兼容接口。通过 body.action 决定增加或扣减。

认证：后台 API key 或 `admin_session` Cookie。

请求：

```json
{
  "action": "add",
  "amount": 20,
  "reason": "manual adjustment"
}
```

## 后台 Blog API

### `GET /api/admin/blogs?limit=20&offset=0`

后台读取全部 Blog，包括草稿。

认证：后台 API key 或 `admin_session` Cookie。

响应：

```json
{
  "blogs": [
    {
      "id": "uuid",
      "title": "First post",
      "slug": "first-post",
      "status": "draft",
      "publishedAt": null,
      "createdAt": "2026-05-13T00:00:00.000Z",
      "updatedAt": "2026-05-13T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/admin/blogs`

创建或按 slug 更新 Blog。

认证：后台 API key 或 `admin_session` Cookie。

请求：

```json
{
  "title": "First post",
  "slug": "first-post",
  "excerpt": "Short summary",
  "content": "Full blog content",
  "coverImageUrl": "https://example.com/cover.jpg",
  "authorName": "Admin",
  "status": "published",
  "metadata": {}
}
```

响应：

```json
{
  "blog": {
    "id": "uuid",
    "title": "First post",
    "slug": "first-post",
    "status": "published",
    "publishedAt": "2026-05-13T00:00:00.000Z"
  }
}
```

说明：

- `status` 只能是 `draft` 或 `published`。
- 发布时自动写入 `publishedAt`。

### `PATCH /api/admin/blogs/:id`

更新 Blog。

认证：后台 API key 或 `admin_session` Cookie。

请求字段同 `POST /api/admin/blogs`，全部可选。

### `DELETE /api/admin/blogs/:id`

删除 Blog。

认证：后台 API key 或 `admin_session` Cookie。

响应：

```json
{
  "ok": true
}
```

## Creem Webhook API

### `POST /api/creem/webhook`

接收 Creem webhook，写入支付记录并分发权益。

认证：Creem 签名。必须配置 `CREEM_WEBHOOK_SECRET`。

支持的签名请求头：

```http
creem-signature: <signature>
x-creem-signature: <signature>
webhook-signature: <signature>
```

请求体：Creem 原始 webhook JSON。后端用 raw body 校验签名。

响应：

```json
{
  "ok": true,
  "paymentId": "uuid",
  "eventType": "subscription.paid"
}
```

忽略事件响应：

```json
{
  "ok": true,
  "ignored": true,
  "eventType": "checkout.completed"
}
```

权益分发：

| 事件/产品 | 后端动作 |
| --- | --- |
| `full_report` 支付成功 | 解锁对应 report，赠送 20 credits |
| `credits_50` / `credits_120` / `credits_300` 支付成功 | 增加对应 credits |
| `subscription.paid` + `pro_monthly` | 写入订阅，发放 150 credits |
| `subscription.paid` + `studio_monthly` | 写入订阅，发放 500 credits |
| `subscription.canceled` | 标记 `cancelAtPeriodEnd` |
| `subscription.expired` / `subscription.paused` | 更新订阅状态 |
| `payment.failed` / `subscription.payment_failed` | 标记订阅 `past_due` |

## 内部用户 API

### `POST /api/users`

创建或更新邮箱用户。建议仅服务端内部使用。

认证：当前未强制后台鉴权，生产环境不要暴露给不可信前端。

请求：

```json
{
  "id": "optional-external-id",
  "email": "user@example.com",
  "name": "User Name",
  "creemCustomerId": "cus_xxx",
  "metadata": {}
}
```

响应：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  }
}
```

## 前端推荐调用流程

### 网站打开

1. `POST /api/site/session`
2. 保存后端写入的 `anon_user_id` Cookie
3. 后续请求都带 `credentials: 'include'`

### 免费脸型检测

1. `POST /api/site/session`
2. `POST /api/face/detect/allow`
3. 前端执行检测
4. `POST /api/face/reports`
5. `GET /api/face/reports/:id`

### Google 登录

1. 前端 Supabase OAuth 登录
2. `POST /api/auth/supabase`
3. 后端把匿名用户升级成 Google 用户

### 解锁完整报告

1. `POST /api/site/checkout`，body 传 `{ "planKey": "full_report", "reportId": "<id>" }`
2. 前端跳转 `checkoutUrl`
3. Creem webhook 调用 `/api/creem/webhook`
4. 后端写入 payment、entitlement、credits
5. 支付成功页轮询 `GET /api/site/access?reportId=<id>`

### 订阅

1. `POST /api/site/checkout`，body 传 `{ "planKey": "pro_monthly" }` 或 `{ "planKey": "studio_monthly" }`
2. 前端跳转 `checkoutUrl`
3. Creem webhook 写入 subscription 并发放月度 credits
4. `GET /api/site/access` 返回 `subscription.active = true`

### AI 生成

1. 用户必须已 Supabase 登录
2. 用户必须拥有并解锁 report
3. `POST /api/ai/try-on`
4. 后端创建 generation 并扣 credits

## 后台推荐调用流程

### 浏览器后台

1. 打开 `/admin`
2. 跳转 `/admin/login`
3. 输入 `ADMIN_API_KEY`
4. 后台页面自动请求：
   - `GET /api/admin/metrics`
   - `GET /api/admin/users`
   - `GET /api/admin/blogs`

### 脚本调用后台 API

```bash
curl "https://your-domain.com/api/admin/metrics?days=30" \
  -H "x-admin-key: <ADMIN_API_KEY>"
```
