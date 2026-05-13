# 后台 API 文档

后台网址和 API 域名统一使用：

```text
https://admin.faceshapedetector.store
```

本地开发：

```text
http://localhost:3000
```

## 规则

- 后台页面必须先登录
- 浏览器后台登录态使用 HttpOnly Cookie：`admin_session`
- 脚本调用后台 API 可直接带 `Authorization: Bearer <ADMIN_API_KEY>` 或 `x-admin-key: <ADMIN_API_KEY>`
- 所有后台接口都返回 JSON

## 请求方式总表

页面路由不是 JSON API：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/admin` | 后台首页，未登录跳转到 `/admin/login` |
| `GET` | `/admin/login` | 后台登录页面 |

后台 API：

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/api/admin/session` | 查询后台登录态 |
| `POST` | `/api/admin/login` | 使用 `ADMIN_API_KEY` 登录 |
| `POST` | `/api/admin/logout` | 退出登录 |
| `GET` | `/api/admin/metrics?days=30` | 后台统计 |
| `GET` | `/api/admin/users?limit=50&offset=0&search=...` | 用户列表 |
| `GET` | `/api/admin/users/:id/credits` | 查询用户积分 |
| `POST` | `/api/admin/users/:id/credits/add` | 增加积分 |
| `POST` | `/api/admin/users/:id/credits/deduct` | 扣减积分 |
| `POST` | `/api/admin/users/:id/credits` | 兼容积分增减接口 |
| `GET` | `/api/admin/blogs?limit=50&offset=0` | 后台 Blog 列表 |
| `POST` | `/api/admin/blogs` | 创建 Blog |
| `PATCH` | `/api/admin/blogs/:id` | 更新 Blog |
| `DELETE` | `/api/admin/blogs/:id` | 删除 Blog |
| `POST` | `/api/users` | 内部创建或更新用户 |
| `POST` | `/api/creem/checkout` | 通用 Creem checkout |
| `POST` | `/api/creem/webhook` | Creem webhook |

## 后台登录

### `GET /admin`

后台首页。未登录会跳转到 `/admin/login`。

### `GET /admin/login`

后台登录页。已登录会跳回 `/admin`。

### `GET /api/admin/session`

查询当前后台登录状态。

返回：

```json
{
  "authenticated": true
}
```

### `POST /api/admin/login`

使用 `ADMIN_API_KEY` 登录。注意：登录 API 只能用 `POST /api/admin/login`，`GET /admin/login` 只是页面路由。

请求：

```json
{
  "adminKey": "change-me-long-random-admin-key"
}
```

返回后会写入 `admin_session` Cookie，默认有效期 7 天。

### `POST /api/admin/logout`

清理 `admin_session` Cookie。

## 统计

### `GET /api/admin/metrics?days=30`

后台核心统计。

返回：

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

`totalUsers` 和 `todayUsers` 只统计已识别/已登录用户，不统计匿名初始化用户。

## 用户和积分

### `GET /api/admin/users?limit=50&offset=0&search=user@example.com`

后台用户列表，包含注册时间和剩余积分。

返回：

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

### `POST /api/admin/users/:id/credits/add`

增加积分。

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

### `POST /api/admin/users/:id/credits/deduct`

扣减积分。

请求：

```json
{
  "amount": 10,
  "source": "admin_deduct",
  "reason": "manual deduction",
  "allowNegative": false
}
```

### `POST /api/admin/users/:id/credits`

兼容接口，通过 body.action 控制 `add` 或 `deduct`。

## Blog

### `GET /api/admin/blogs?limit=50&offset=0`

后台 Blog 列表，包含草稿。

### `POST /api/admin/blogs`

创建或更新 Blog。

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

### `PATCH /api/admin/blogs/:id`

更新 Blog。

### `DELETE /api/admin/blogs/:id`

删除 Blog。

## 内部接口

### `POST /api/users`

创建或更新用户。偏内部使用，不建议给前端直接暴露。

### `POST /api/creem/checkout`

通用 Creem checkout。更推荐前端走 `/api/site/checkout`。

### `POST /api/creem/webhook`

Creem webhook 入口。

签名头支持：

```http
creem-signature: <signature>
x-creem-signature: <signature>
webhook-signature: <signature>
```

Webhook 成功后会写入支付记录，并分发权益：

- `full_report`：解锁当前 report，赠送 20 credits
- `credits_50` / `credits_120` / `credits_300`：增加对应 credits
- `pro_monthly`：写入订阅，并发放 150 credits
- `studio_monthly`：写入订阅，并发放 500 credits

Webhook 地址：

```text
https://admin.faceshapedetector.store/api/creem/webhook
```

## 后台接入顺序

### 浏览器后台

1. 打开 `/admin`
2. 跳转 `/admin/login`
3. 输入 `ADMIN_API_KEY`
4. 页面先请求 `/api/admin/session` 校验登录态
5. 页面直接请求 `metrics`、`users`、`blogs`，并已接入 Blog 新增/编辑/删除、用户积分增加/扣减

### 服务端脚本

```bash
curl "https://admin.faceshapedetector.store/api/admin/metrics?days=30" \
  -H "x-admin-key: <ADMIN_API_KEY>"
```
