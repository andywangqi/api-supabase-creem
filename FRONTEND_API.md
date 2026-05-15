# 前端 API 文档

前端网站和接口统一使用：

```text
https://admin.faceshapedetector.store
```

本地开发：

```text
http://localhost:3000
```

## 规则

- 请求 JSON 时使用 `Content-Type: application/json`
- 需要用户身份的请求必须带 `credentials: 'include'`
- 匿名用户用 HttpOnly Cookie：`anon_user_id`
- 错误格式统一为：

```json
{
  "error": {
    "message": "Unauthorized",
    "details": {}
  }
}
```

## 计费参数

### planKey

| planKey | 类型 | 价格 | 权益 |
| --- | --- | ---: | --- |
| `full_report` | 一次性 | $6.99 | 解锁当前 report，赠送 20 credits |
| `credits_50` | 一次性 | $4.99 | 增加 50 credits |
| `credits_120` | 一次性 | $9.99 | 增加 120 credits |
| `credits_300` | 一次性 | $19.99 | 增加 300 credits |
| `pro_monthly` | 订阅 | $9.99/月 | 每月 150 credits，每天 50 次检测，解锁所有 report |
| `studio_monthly` | 订阅 | $19.99/月 | 每月 500 credits，每天 200 次检测，解锁所有 report |

### AI 扣费

| type | credits |
| --- | ---: |
| `makeup` | 8 |
| `hairstyle` | 10 |
| `hd` | 20 |

## 接口

## 请求方式总表

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/api/health` | 健康检查兼容路径 |
| `GET` | `/api/site/session` | 读取或创建匿名用户 |
| `POST` | `/api/site/session` | 创建匿名用户或升级邮箱用户 |
| `POST` | `/api/auth/supabase` | 保存 Supabase Google 登录用户 |
| `GET` | `/api/site/credits` | 查询当前用户积分 |
| `POST` | `/api/site/credits/deduct` | 扣减当前用户积分 |
| `POST` | `/api/face/detect/allow` | 检查并递增检测次数 |
| `POST` | `/api/face/reports` | 保存脸型检测报告 |
| `GET` | `/api/face/reports/:id` | 读取检测报告 |
| `GET` | `/api/site/access?reportId=...` | 查询权益和报告解锁状态 |
| `POST` | `/api/site/checkout` | 按 `planKey` 创建 checkout |
| `POST` | `/api/ai/try-on` | 创建 AI 生成记录并扣积分 |
| `GET` | `/api/blogs?limit=20&offset=0` | 公开 Blog 列表 |
| `GET` | `/api/blogs/:slug` | 公开单篇 Blog |

### `GET /health`

也支持 `GET /api/health`。

返回：

```json
{
  "ok": true,
  "service": "api-supabase-creem",
  "time": "2026-05-13T00:00:00.000Z"
}
```

### `GET /api/site/session`

读取或创建匿名用户。

返回：

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

创建匿名用户，或用邮箱升级用户。

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

- `email` 可选，不传就只创建/刷新匿名用户
- 支持 `anonymousId`、`anonymous_id`、`x-anonymous-id`
- 前端必须复用返回的 `anonymousId`：优先让浏览器通过 `credentials: 'include'` 带 Cookie；如果 Cookie 不能稳定发送，就把响应里的 `anonymousId` 存在本地，后续请求放到 `x-anonymous-id` 或 body 里。

### `POST /api/auth/supabase`

保存 Supabase Google 登录用户。

请求头：

```http
Authorization: Bearer <supabase_access_token>
Cookie: anon_user_id=<anonymous_id>
x-anonymous-id: <anonymous_id>
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

返回：

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

### `GET /api/site/credits`

查询当前用户积分。

认证：`anon_user_id` Cookie 或 `x-anonymous-id`

### `POST /api/site/credits/deduct`

扣减当前用户积分。

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

### `POST /api/face/detect/allow`

检查并递增当天检测次数。

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

### `POST /api/face/reports`

保存脸型检测报告。

请求：

```json
{
  "faceShape": "oblong",
  "confidence": 0.92,
  "scores": {},
  "characteristics": {},
  "freeResult": {},
  "fullResult": {},
  "imageUrl": "https://example.com/image.jpg",
  "metadata": {}
}
```

返回的 `report.fullResult` 在未解锁时为 `null`。

### `GET /api/face/reports/:id`

读取当前用户自己的报告。

### `GET /api/site/access?reportId=<report_id>`

查询当前用户权益、订阅和报告解锁状态。

返回：

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "creditsBalance": 150
  },
  "subscription": {
    "active": true
  },
  "report": {
    "unlocked": true,
    "source": "subscription"
  }
}
```

### `POST /api/site/checkout`

创建 Creem Checkout。

请求：

```json
{
  "planKey": "full_report",
  "reportId": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "successUrl": "https://admin.faceshapedetector.store/payment-success"
}
```

说明：

- `full_report` 必须传 `reportId`
- `credits_50`、`credits_120`、`credits_300`、`pro_monthly`、`studio_monthly` 不需要 `reportId`

### `POST /api/ai/try-on`

创建 AI 生成并扣积分。

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

### `GET /api/blogs`

读取公开 Blog 列表。

### `GET /api/blogs/:slug`

读取公开单篇 Blog。

Blog 返回对象包含 `schema`，可直接作为 JSON-LD 使用：

```json
{
  "schema": {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": "First post",
    "description": "Short summary",
    "datePublished": "2026-05-15T01:00:00.000Z",
    "dateModified": "2026-05-15T02:00:00.000Z",
    "image": "https://example.com/cover.jpg",
    "author": {
      "@type": "Person",
      "name": "Admin"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Face Shape Detector",
      "url": "https://admin.faceshapedetector.store"
    }
  }
}
```

## 推荐调用顺序

### 网站打开

1. `POST /api/site/session`
2. 页面保存 `anon_user_id`
3. 后续请求带 `credentials: 'include'`

### 免费检测

1. `POST /api/face/detect/allow`
2. 执行检测
3. `POST /api/face/reports`
4. `GET /api/face/reports/:id`

### 解锁报告

1. `POST /api/site/checkout`
2. 跳转 `checkoutUrl`
3. 支付后查 `GET /api/site/access?reportId=...`

### 订阅

1. `POST /api/site/checkout`，`planKey=pro_monthly` 或 `studio_monthly`
2. 支付后查 `GET /api/site/access`
