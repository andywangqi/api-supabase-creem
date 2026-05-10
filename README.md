# API + Supabase + Creem

轻量 Node.js 后端，支持本地运行和 Vercel 部署，包含：

- 后台页面：`/admin`
- 管理统计 API：总用户数、当天用户数、当天收入、总收入、每日收入
- Supabase 数据表和 RPC：`sql/schema.sql`
- Creem Checkout 创建接口
- Creem Webhook 入账接口

## 本地启动

1. 在 Supabase SQL Editor 执行 `sql/schema.sql`
2. 复制 `.env.example` 为 `.env` 并填入密钥
3. 启动服务：

```bash
node src/server.js
```

打开：

```text
http://localhost:3000/admin
```

后台页面里输入 `ADMIN_API_KEY`。

## Vercel 部署

1. 把本仓库导入 Vercel
2. 在 Vercel Project Settings -> Environment Variables 配置 `.env.example` 里的变量
3. 部署后访问 `/admin`

Vercel 路由：

- `/admin` -> 后台页面
- `/api/*` -> `api/[...path].js`
- `/api/site/session` -> 前端网站初始化/匿名登录接口
- `/api/blogs` -> 公开 Blog 列表接口
- `/api/admin/blogs` -> 后台 Blog 上传接口
- `/payment-success` -> 支付成功页

## API

### 健康检查

```http
GET /health
```

### 创建/更新用户

```http
POST /api/users
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "User Name"
}
```

### 前端网站初始化/匿名登录

网站打开时调用：

```http
POST /api/site/session
Content-Type: application/json
```

没有用户 Cookie 时会创建匿名用户，返回用户并写入 `anon_user_id` Cookie。

```json
{
  "user": {
    "id": "uuid",
    "anonymousId": "uuid",
    "email": null,
    "isAnonymous": true
  },
  "anonymousId": "uuid",
  "isNewUser": true,
  "mode": "anonymous"
}
```

如果前端已有登录邮箱，可以同一个接口转正式用户：

```http
POST /api/site/session
Content-Type: application/json

{
  "email": "user@example.com",
  "name": "User Name"
}
```

前端示例：

```js
await fetch('/api/site/session', {
  method: 'POST',
  credentials: 'include',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});
```

### 管理统计

```http
GET /api/admin/metrics?days=30
Authorization: Bearer <ADMIN_API_KEY>
```

### 后台上传 Blog

```http
POST /api/admin/blogs
Authorization: Bearer <ADMIN_API_KEY>
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

管理端接口：

```http
GET /api/admin/blogs?limit=50
PATCH /api/admin/blogs/:id
DELETE /api/admin/blogs/:id
```

公开网站接口：

```http
GET /api/blogs?limit=20&offset=0
GET /api/blogs/:slug
```

### 创建 Creem Checkout

```http
POST /api/creem/checkout
Content-Type: application/json

{
  "email": "user@example.com",
  "productId": "prod_xxx"
}
```

返回里使用 `checkoutUrl` 跳转到支付页。

### Creem Webhook

```text
POST /api/creem/webhook
```

在 Creem 后台配置 Webhook URL 为：

```text
https://your-domain.com/api/creem/webhook
```

收入统计按 `payments.amount` 的最小货币单位保存，例如 USD cents。
