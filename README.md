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

### 管理统计

```http
GET /api/admin/metrics?days=30
Authorization: Bearer <ADMIN_API_KEY>
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
