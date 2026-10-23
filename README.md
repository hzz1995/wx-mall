# 商品订单微信小程序

一个用于商品展示和订单记录的小程序：**不开放搜索、不接在线支付**，可通过小程序码进入。客户用手机号登录后浏览、加购物车、下单；管理员在 Web 管理后台维护商品、用户、订单和客户。

## 功能

客户侧（微信小程序）：

- 进入小程序必须手机号 + 密码登录，未登录不能查看商品
- 暂时隐藏首页，只保留三个 Tab：全部商品、购物车、我的
- 全部商品：分类筛选、销量/最新排序、店内搜索；服务端分页，每页 10 条，滚动加载
- 商品详情：多图预览、视频播放、规格型号/生产日期/产地、加入购物车、立即购买
- 加购弹窗：可直接输入或加减数量，一次加入多件
- 商品详情底部提供购物车快捷入口和数量角标
- 购物车：勾选、改数量、移除、全选、批量结算
- 客户可售范围：后台可为客户绑定商品；未绑定则看到全部商品，绑定后仅看到关联商品
- 下单：多商品订单、收货地址、备注，无需在线支付；仅客户类型 `KH` 可加购和下单
- 我的：个人资料、修改密码；仅 `KH` 展示“我的订单”
- 我的订单：服务端分页，每页 10 条，滚动加载；支持“再来一单”，可修改数量后重新提交
- 小程序码：可打开全部商品页或指定商品

店主侧（Web 管理后台）：

- 手机号 + 密码登录；首次部署初始化管理员
- 管理员与销售均可登录后台，销售只能查看自己关联客户的数据
- 用户管理：客户（KH）/ 销售（XS）/ 运营（YY）/ 管理员（GLY）
  - 客户类型必须填写门店名称、收货地址，并指定负责销售
  - 可为客户绑定可售商品；不绑定表示可查看全部商品
  - 支持停用账号、重置密码（默认重置为 `123456`）
- 订单管理：按状态、销售、关键词筛选，列表显示负责销售，查看详情、取消订单（回滚销量）
- 购物车管理：按客户、销售、关键词查看购物车明细、数量和金额（销售仅自己客户）
- 商品管理：多图 + 视频、规格型号、生产日期、产地、上下架、分类、排序、删除；支持服务端分页、搜索和分类筛选
- 分类管理
- 客户汇总：按客户账号统计订单数、累计消费、最近下单、负责销售；管理员可按销售筛选
- 数据报表：商品采购最多/最少、客户下单最多/最少、销售业绩排行（仅管理员）
  - 默认统计今天，支持昨天、最近一周/一月/三月/半年/一年、自定义日期范围，不提供全部时间
  - 自定义范围最多跨度一年，按订单创建时间筛选
  - 各排行只返回前 10 条；商品/客户排行只统计区间内有采购或有下单的对象，不加载全量商品和客户
- 小程序码生成与下载（全部商品页码 / 商品码）
- 店铺设置：店名、公告、客服微信号

不包含：在线支付、库存、多规格 SKU、优惠券、物流跟踪、退款流程。

## 技术架构

```
客户微信小程序 ── wx.cloud.callFunction ──┐
                                          ├──> 云函数 api ──> 云数据库 / 云存储
店主浏览器 ── HTTPS（云函数 URL 化）──────┘         └──> 微信开放接口（小程序码）
```

- 小程序：原生 WXML / WXSS / JavaScript
- 后端：微信云开发云函数（Node.js），单函数统一入口
- 数据库：users / categories / products / carts / orders / settings
- 图片与视频：云存储
- 管理后台：Vue 3 + Vite + Element Plus，Hash 路由

## 目录结构

```
wx-mall/
├─ project.config.json          # 微信开发者工具项目配置（需填 AppID）
├─ miniprogram/                 # 小程序端
│  ├─ app.js / app.json / app.wxss
│  ├─ config.js                 # 云环境 ID 配置
│  ├─ sitemap.json              # 禁止被索引
│  ├─ utils/                    # 会话、云函数调用、购物车角标
│  └─ pages/
│     ├─ index/                 # 首页（暂时不注册，保留文件）
│     ├─ products/              # 全部商品
│     ├─ product/               # 商品详情（图片 + 视频）
│     ├─ cart/                  # 购物车
│     ├─ checkout/              # 确认订单
│     ├─ orders/                # 我的订单
│     ├─ order-detail/          # 订单详情
│     ├─ mine/                  # 我的
│     ├─ login/                 # 登录
│     ├─ profile/               # 个人资料
│     └─ password/              # 修改密码
├─ cloudfunctions/
│  └─ api/
│     ├─ index.js               # 小程序 callFunction 与 HTTP 双入口
│     ├─ config.json            # 云调用权限（小程序码）
│     ├─ lib/                   # 数据库、令牌、密码、用户、存储工具
│     └─ routes/                # mini.js / admin.js
└─ admin/                       # Web 管理后台
   ├─ .env.example
   └─ src/
```

## 快速开始

### 1. 准备

- 微信小程序账号（个人主体即可；本项目不使用微信支付）
- 微信开发者工具
- 本地 Node.js 18+（仅管理后台需要）
- 开通云开发环境（基础套餐价格以控制台为准，通常约 20 元/月）

### 2. 导入项目与基础配置

1. 微信开发者工具 → 导入项目，目录选择 `wx-mall`。
2. 把 `project.config.json` 中的 `appid` 改成你的小程序 AppID。
3. 开发者工具中开通云开发，记下环境 ID。
4. 修改 `miniprogram/config.js`：

```js
module.exports = {
  ENV_ID: '你的云环境ID',
  FUNCTION_NAME: 'api'
}
```

### 3. 部署云函数

1. 首次部署前，右键 `cloudfunctions` 目录 → **选择云环境**，选中与环境 ID 对应的环境（例如 `cloud1-xxx`）。如果菜单里没有该项，先点开发者工具顶部「云开发」打开控制台。
2. 右键 `cloudfunctions/api` → **上传并部署：云端安装依赖**。
3. 云函数运行环境选择 Node.js 16.13 或更高版本。
4. 在云开发控制台 → 云函数 → `api` → 配置：
   - **超时时间：60 秒**（视频上传需要）
   - **内存：512MB**（视频分片合并需要）
   - 环境变量：
     - `TOKEN_SECRET`：登录令牌签名密钥，建议 32 位以上随机字符串
     - `SETUP_CODE`：首次初始化管理员时使用的校验码，建议独立随机字符串
5. `config.json` 已声明 `wxacode.getUnlimited` 云调用权限，修改后需重新部署。

### 4. 创建数据库集合

在云开发控制台 → 数据库，创建以下集合：

| 集合 | 用途 | 权限建议 |
|---|---|---|
| `users` | 用户账号（客户/销售/运营/管理员） | 所有用户不可读写 |
| `categories` | 商品分类 | 所有用户不可读写 |
| `products` | 商品（含图片、视频） | 所有用户不可读写 |
| `carts` | 购物车（每个用户一条文档） | 所有用户不可读写 |
| `orders` | 订单 | 所有用户不可读写 |
| `settings` | 店铺设置（文档 ID `shop`） | 所有用户不可读写 |
| `audit_logs` | 操作日志（商品/分类增删改） | 所有用户不可读写 |

客户端不直接访问数据库，所有读写都经过云函数，因此七个集合都设为最严格的“所有用户不可读写”。云函数首次写日志时会尝试自动创建 `audit_logs`，也可以提前手动创建。

建议索引：

- `users`：`phone` 唯一索引（登录、手机号唯一性）
- `orders`：`userId` 升序 + `createdAt` 降序（我的订单）
- `orders`：`status` 升序 + `createdAt` 降序（后台筛选）
- `products`：`code` 唯一索引（小程序码短码）
- `products`：`status` 升序 + `sort` 升序 + `createdAt` 降序（商品列表默认排序）
- `products`：`status` 升序 + `categoryId` 升序 + `sort` 升序 + `createdAt` 降序（分类筛选）
- `products`：`status` 升序 + `sales` 降序 + `createdAt` 降序（销量排序）
- `users`：`type` 升序 + `salesId` 升序（客户/销售筛选）
- `categories`：`sort` 升序
- `audit_logs`：`createdAt` 降序（日志列表）
- `audit_logs`：`action` 升序 + `createdAt` 降序（按操作类型筛选）
- `audit_logs`：`operatorId` 升序 + `createdAt` 降序（按操作人筛选）

`settings` 文档无需手动创建，首次保存店铺设置时会自动写入。

### 5. 开启云函数 HTTP 访问服务

管理后台通过公网 HTTPS 调用云函数，小程序端不需要这一步。

1. 打开云开发控制台，左侧选择 **环境管理 / 环境 → HTTP 访问服务**（不同版本也可能显示为「访问服务」）。
2. 在 **HTTP 触发** / **路由管理** 中点击 **新建**。
3. 按下面填写：
   - 触发路径：`/mall-api`
   - 关联资源类型：云函数
   - 云函数：`api`
   - 鉴权 / 身份验证：**关闭**（登录鉴权由云函数内部的 Token 完成）
   - 请求方法：允许全部方法（后台会用到 GET/POST/PUT/PATCH/DELETE/OPTIONS）
4. 保存后等待路由创建完成（通常几十秒到几分钟），复制控制台显示的默认域名。
5. 最终管理端接口地址为：`默认域名 + /mall-api`，例如：
   `https://xxxx.service.tcloudbase.com/mall-api`
6. 浏览器访问 `https://<...>/mall-api/health`，应返回 `{"ok":true,...}`。

> 注意：路径必须与 `VITE_API_BASE` 中的 `/mall-api` 完全一致；如果打开了平台鉴权，后台请求会被拦截，需要保持关闭。

云函数已处理 CORS，管理后台可部署在任意域名。

### 6. 配置并运行管理后台

```bash
cd admin
cp .env.example .env
# 编辑 .env
# VITE_API_BASE=https://<env-id>.service.tcloudbase.com/mall-api
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。

首次打开会自动进入“初始化管理员”：

- 初始化校验码：云函数环境变量 `SETUP_CODE`
- 手机号 / 姓名 / 密码：即超级管理员账号
- 系统只允许在没有任何管理员时初始化一次

初始化完成后用手机号 + 密码登录。

生产构建：

```bash
npm run build
# dist/ 可上传到云开发静态网站托管、Nginx 或任意静态服务器
```

### 7. 初始化账号与商品

推荐顺序：

1. **店铺设置**：店名、公告、客服微信号。
2. **分类管理**：创建分类。
3. **用户管理**：先创建销售账号（XS），再创建客户账号（KH），并给客户指定负责销售；需要限制商品范围时再为客户绑定可售商品。
4. **商品管理**：新增商品，上传图片和视频，设置售价与排序。
5. 小程序端用客户手机号登录验证。

客户账号没有自助注册，均由管理员在后台创建；忘记密码可由管理员重置。

### 8. 体验、发布与访问设置

1. 开发者工具点“预览”或上传体验版，添加体验成员测试。
2. 提交微信审核并发布。
3. **关闭搜索**：微信公众平台 → 设置 → 基本设置 → 隐私设置 → 关闭「允许被搜索」。
4. `sitemap.json` 已对所有页面设置 `disallow`。
5. 不要开通「附近的小程序」等公开展示入口。
6. 在管理后台「小程序码」生成全部商品页码或商品码，保存或打印使用。

注意：

- **正式版**小程序码需要小程序发布后才能被普通客户打开。
- 尚未发布时生成**体验版**码，扫码人必须先被添加为体验成员。
- 关闭搜索不影响小程序码和分享卡片打开小程序。

## 账号与权限

| 类型 | 标识 | 小程序 | 管理后台 |
|---|---|---|---|
| 客户 | `KH` | 浏览、购物车、下单、查自己的订单 | 无 |
| 销售 | `XS` | 可浏览，不能加购/下单 | 可登录；只读查看自己客户的订单、客户汇总、购物车 |
| 运营 | `YY` | 可浏览，不能加购/下单 | 可登录；商品新增、编辑、删除和分类管理，操作写入日志 |
| 管理员 | `GLY` | 可登录和购物 | 全部管理功能 |

- 密码使用 `scrypt` 加盐哈希存储，不保存明文。
- 小程序令牌有效期 30 天，管理后台令牌有效期 12 小时。
- 每个请求都会回查用户是否被停用；停用后旧令牌立即失效。
- 客户下单时会把 `userId`、姓名、手机号、店铺名称、地址、负责销售快照写入订单，方便后续追溯。
- 客户类型创建/编辑时必须填写门店名称、收货地址，并选择一个销售账号作为负责销售。
- 只有客户类型 `KH` 可以加入购物车、下单、查看“我的订单”；销售和管理员账号只能浏览商品。
- 管理员重置密码默认为 `123456`，用户登录小程序后可在“我的 → 修改密码”中修改。
- 小程序进入前强制登录；`getCatalog`、`getProduct` 云函数也要求有效登录令牌。
- 首页暂未启用，小程序启动页和首页码都指向“全部商品”页；首页文件保留，后续可恢复。
- 销售登录后台后：
  - 订单按订单上的 `salesId` 快照过滤，只能看到自己负责的订单
  - 客户汇总按当前 `users.salesId` 过滤，只能看到分配给自己的客户
  - 购物车按当前客户归属过滤，只能看到自己客户的购物车
  - 不能访问商品、分类、用户、小程序码、店铺设置等管理接口，后端会直接返回 403

### 没有 HTTP 访问服务时手动创建账号

如果使用免费体验环境、暂时无法配置 HTTP 访问服务，可以直接在云开发控制台 → 数据库 → `users` 集合插入账号，作为临时方案。

密码不能存明文，先用仓库脚本生成 `passwordSalt` 和 `passwordHash`：

```bash
cd D:\java\project\810\wx-mall
node scripts/hash-password.js 你的密码
```

输出示例：

```json
{
  "passwordSalt": "c48ed79a01e77b93de62265805dd7a47",
  "passwordHash": "f08bcc7a..."
}
```

把这两个值原样复制到用户文档中。

管理员 `GLY`：

```json
{
  "phone": "13800000000",
  "name": "店主",
  "type": "GLY",
  "shopName": "",
  "address": "",
  "salesId": "",
  "enabled": true,
  "passwordSalt": "脚本输出的值",
  "passwordHash": "脚本输出的值",
  "createdAt": 1790000000000,
  "updatedAt": 1790000000000
}
```

销售 `XS`（先创建销售，拿到它的 `_id`，再创建客户）：

```json
{
  "phone": "13900000000",
  "name": "李销售",
  "type": "XS",
  "shopName": "",
  "address": "",
  "salesId": "",
  "enabled": true,
  "passwordSalt": "脚本输出的值",
  "passwordHash": "脚本输出的值",
  "createdAt": 1790000000000,
  "updatedAt": 1790000000000
}
```

客户 `KH`（`salesId` 必须填写销售账号的 `_id`）：

```json
{
  "phone": "13700000000",
  "name": "张三",
  "type": "KH",
  "shopName": "张三便利店",
  "address": "上海市静安区南京西路 100 号",
  "salesId": "销售账号的_id",
  "enabled": true,
  "passwordSalt": "脚本输出的值",
  "passwordHash": "脚本输出的值",
  "createdAt": 1790000000000,
  "updatedAt": 1790000000000
}
```

注意：

- 每个账号使用独立生成的盐和哈希，不要复用
- `phone` 必须唯一
- `type` 必须是 `KH`、`XS`、`YY`、`GLY` 之一
- `enabled` 必须是布尔值 `true`
- `salesId` 只能指向类型为 `XS` 的用户 `_id`
- 客户类型必须填写 `shopName`、`address` 和 `salesId`，否则后台编辑时无法通过校验
- `productIds` 可选，最多绑定 100 件商品；留空表示查看全部商品
- 手动创建 GLY 后，后台初始化接口会认为管理员已存在，只能直接登录

## 数据模型

### users

```json
{
  "_id": "...",
  "phone": "13800138000",
  "name": "张三",
  "shopName": "张三便利店",
  "address": "上海市……",
  "salesId": "销售用户的 _id",
  "productIds": ["商品 _id", "商品 _id"],
  "type": "KH",
  "enabled": true,
  "passwordSalt": "...",
  "passwordHash": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

`productIds` 为客户的可售商品绑定：

- 空数组或不设置：可查看全部上架商品。
- 非空数组：商品列表、分类、商品详情、购物车、结算和下单都只允许这些商品；服务端会同时校验，不能通过直接调用接口绕过。
- 仅 `KH` 使用该字段；销售和管理员始终查看全部商品。

### products

```json
{
  "_id": "...",
  "name": "手冲咖啡豆 250g",
  "categoryId": "...",
  "price": 6800,
  "originalPrice": 8800,
  "images": ["cloud://..."],
  "videos": ["cloud://..."],
  "spec": "500g/袋",
  "productionDate": "2026-08-01",
  "origin": "贵州",
  "description": "产地、烘焙度、风味描述……",
  "status": "ON",
  "code": "a8k2m4xq",
  "sales": 12,
  "sort": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

价格以**分**为单位存储。`code` 是 8 位短码，用于小程序码 `scene`（上限 32 字符）。

### carts（文档 ID 即用户 ID）

```json
{
  "_id": "用户ID",
  "userId": "用户ID",
  "items": [
    { "productId": "...", "quantity": 2, "checked": true, "addedAt": "..." }
  ],
  "updatedAt": "..."
}
```

### orders

```json
{
  "_id": "...",
  "orderNo": "M2026102115301234",
  "userId": "用户ID",
  "openid": "微信openid（审计用）",
  "items": [
    { "productId": "...", "name": "手冲咖啡豆 250g", "price": 6800, "quantity": 2, "image": "cloud://..." }
  ],
  "totalAmount": 13600,
  "customerName": "张三",
  "phone": "13800138000",
  "shopName": "张三便利店",
  "address": "上海市……",
  "salesId": "销售用户ID",
  "salesName": "李销售",
  "remark": "周末发货",
  "source": "cart",
  "status": "DONE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

下单即 `DONE`，不涉及支付与履约流转；后台取消后变为 `CANCELLED` 并回滚销量。

### settings（文档 ID 固定为 `shop`）

```json
{ "_id": "shop", "shopName": "祥哥小铺", "notice": "公告", "serviceWechat": "客服微信号" }
```

### audit_logs

```json
{
  "_id": "...",
  "action": "PRODUCT_UPDATE",
  "resource": "product",
  "resourceId": "商品 _id",
  "resourceName": "商品名称",
  "operatorId": "操作人 _id",
  "operatorName": "操作人姓名",
  "operatorPhone": "操作人手机号",
  "operatorType": "YY",
  "before": { "name": "修改前", "price": 1990, "status": "ON" },
  "after": { "name": "修改后", "price": 2190, "status": "OFF" },
  "createdAt": "..."
}
```

记录商品和分类的新增、编辑、删除；新增时 `before` 为空，删除时 `after` 为空。操作日志只允许管理员在后台查看，客户端不可读写。日志详情中，编辑操作只展示发生变化的字段并高亮变更后内容；新增和删除只展示关键信息，不做字段对比。商品管理和分类管理列表提供“变更日志”入口，可直接查看该对象的日志；日志页默认查询最近 7 天，最长 14 天。

## 图片与视频上传

- 图片：管理端先压缩到最长边 1200px，再以二进制方式上传，单张上限 2MB，每件商品最多 4 张。
- 视频：管理端按 2MB 二进制分片上传，云函数合并后写入云存储，单个视频上限 40MB，每件商品最多 2 个。
- 图片和视频分片使用 `application/octet-stream` / `image/*` 二进制请求，不走 JSON base64。HTTP 网关对文本 JSON 请求体限制很小（约 100KB），二进制请求上限为 6MB，这是避免 `EXCEED_MAX_PAYLOAD_SIZE` 的关键。
- 视频分片临时文件位于 `mall/tmp/{uploadId}/`，合并成功后会删除；中断的上传会留下临时分片，可在云存储控制台定期清理。
- 商品详情页通过云函数换取视频临时播放地址；图片直接使用云存储文件 ID。
- 上传大视频时请确保云函数超时为 60 秒、内存 512MB，否则合并可能超时或内存不足。

## 管理端接口

除 `/health`、`/setup`、`/setup/status`、`/login` 外，均需 `Authorization: Bearer <token>`。

- `GLY`：可访问全部接口
- `XS`：只能访问 `/me`、订单查询（自动限制为自己负责的订单）、客户汇总（自动限制为自己客户）、购物车查询（自动限制为自己客户）
- `YY`：只能访问 `/me`、商品列表和商品新增/编辑/删除、分类管理、商品图片/视频上传；每次商品或分类变更都会记录到 `audit_logs`
- 用户、设置、上传、小程序码、报表、取消订单：仅 `GLY`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/setup/status` | 是否需要初始化管理员 |
| POST | `/setup` | 初始化管理员（校验 `SETUP_CODE`） |
| POST | `/login` | 手机号 + 密码登录（GLY / XS / YY） |
| GET | `/health` | 服务连通性检查 |
| GET | `/me` | 当前登录用户 |
| GET | `/users?type=&keyword=&page=&pageSize=` | 用户列表（GLY） |
| GET | `/users/sales` | 启用中的销售列表（GLY） |
| POST | `/users` | 新增用户（GLY；KH 必填门店、地址、负责销售，可选 `productIds`） |
| PUT | `/users/:id` | 修改用户/分配销售/停用/绑定可售商品（GLY） |
| POST | `/users/:id/password` | 重置密码，未传密码时默认 `123456`（GLY） |
| GET | `/orders?status=&salesId=&keyword=&page=&pageSize=` | 订单列表（XS 自动按自己过滤） |
| GET | `/orders/:id` | 订单详情（XS 只能看自己的订单） |
| PATCH | `/orders/:id` | 取消订单（GLY） |
| GET | `/carts?keyword=&salesId=&page=&pageSize=` | 客户购物车列表（XS 自动过滤，GLY 可按销售筛选） |
| GET | `/products?page=&pageSize=&keyword=&categoryId=&ids=&simple=` | 商品分页列表（GLY / YY；`ids` 用于批量回显，最多 100 个；`simple=1` 跳过临时地址生成，供选择器使用） |
| POST | `/products` | 新增商品（GLY） |
| PUT | `/products/:id` | 更新商品（GLY / YY） |
| DELETE | `/products/:id` | 删除商品（GLY） |
| GET | `/categories` | 分类列表（GLY / YY） |
| POST / PUT / DELETE | `/categories`、`/categories/:id` | 分类维护（GLY / YY） |
| GET | `/customers?salesId=` | 客户汇总（XS 自动按自己过滤，GLY 可按销售筛选） |
| GET | `/reports?start=&end=` | 数据报表（GLY，start/end 为毫秒时间戳，默认今天，跨度最多一年） |
| GET | `/audit-logs?page=&pageSize=&action=&keyword=&resource=&resourceId=&start=&end=` | 操作日志（GLY；支持操作类型、商品/分类名称、资源和 ID 筛选；默认最近 7 天，最长 14 天） |
| GET / PUT | `/settings` | 店铺设置（GLY） |
| POST | `/upload` | 上传图片（二进制，GLY / YY） |
| POST | `/upload/chunk?uploadId=&index=&totalChunks=` | 上传视频分片（二进制，GLY / YY） |
| POST | `/upload/video` | 合并视频分片（JSON，GLY / YY） |
| POST | `/qrcode` | 生成小程序码（GLY） |

小程序端 `action`：

- 公开：`login`、`getSettings`、`ping`
- 需登录：`getCatalog`、`listProducts`、`getProduct`、`me`、`updateProfile`、`changePassword`、`getCart`、`addToCart`、`updateCartItem`、`setCartCheckedAll`、`removeCartItem`、`getCheckoutPreview`、`createOrder`、`listMyOrders`、`getMyOrder`
- `getCatalog` 默认返回店铺信息、分类和全部商品；传 `includeProducts: false` 时只返回店铺信息和分类，供商品页首屏使用
- `listProducts` 参数：`page`、`categoryId`、`keyword`、`sort`（`default`/`sales`/`new`），固定每页 10 条，返回 `list` 和 `hasMore`，不查询总数
- `listMyOrders` 参数：`page`、`pageSize`（默认和前端均为 10），返回 `list` 和 `hasMore`，不查询总数
- 购物车操作、结算、下单仅允许 `KH`；销售/管理员调用会返回业务错误

## 安全说明

- 七个集合对客户端完全关闭，仅云函数可读写。
- 密码使用 `scrypt` 加盐哈希；登录令牌使用 HMAC-SHA256 签名。
- 商品价格、订单金额全部在云函数中按数据库价格重新计算，不信任客户端传值。
- 客户只能查询自己的订单（按 `userId` 校验）。
- 销售后台权限在服务端校验，不能通过修改前端菜单越权；订单、客户、购物车均按销售归属过滤。
- 管理员不能停用自己，也不能修改自己的管理员类型，避免把后台锁死。
- 重置密码默认 `123456`，首次登录后应尽快修改。
- 初始化接口只有在系统没有管理员时才可用，并且需要 `SETUP_CODE`。
- 不要把 `admin/.env` 和云函数环境变量提交到代码仓库。
- 云存储旧图片/视频在删除商品时不会自动清理，可在控制台定期清理；`mall/tmp/` 下的中断分片同理。

## 已知限制

- 没有在线支付，订单提交即完成；取消订单只能由管理员操作。
- 没有库存与多规格，超卖风险由店主人工把控。
- 客户账号由管理员创建，不提供自助注册。
- 销售可登录后台，但只读查看自己客户的订单、客户汇总和购物车，不能管理商品与用户。
- 销售订单按订单创建时的负责销售快照过滤；如果客户被重新分配，历史订单仍归属原销售。
- 购物车列表支持按销售筛选，最多读取 500 条购物车和 1000 位用户；商品名称按购物车中的商品 ID 精确批量查询，不受商品总数限制。
- 首页暂时隐藏，只保留三个 Tab；二维码的“全部商品页”指向 `pages/products/index`。
- 商品规格型号、生产日期、产地当前按文本存储，生产日期由后台日期选择器生成 `YYYY-MM-DD`。
- “再来一单”会按当前商品价格重新结算；如果订单里有已删除或已下架商品，会提示无法结算。
- 单笔订单最多 20 种商品；购物车单项数量 1-99。
- 视频单个上限 40MB，超时时间依赖云函数配置。
- 客户汇总最多统计 1000 位客户与最近 1000 条已完成订单。
- 数据报表基于所选时间范围内最多 3000 条已完成订单聚合，不再加载全量用户和商品；商品采购最少、客户下单最少只统计区间内有采购或有下单的对象，各排行返回前 10 条。
- 云函数低频访问存在冷启动，首次请求可能慢 1–3 秒。
- 当前版本已完成静态校验、管理端构建和浏览器 mock 回归，**尚未在真实云环境、微信开发者工具中联调**。

## 常见问题

**提示“数据库集合未创建”**
按第 4 步创建七个集合。

**管理后台一直提示初始化校验码错误**
确认云函数环境变量 `SETUP_CODE` 已保存，并重新部署云函数。

**初始化提示“管理员已初始化”**
说明 users 集合已有 GLY 账号，直接去登录；忘记密码可先用已有管理员重置，或按需在控制台处理。

**登录提示“手机号或密码错误”**
小程序和管理后台共用 users 表；账号需由管理员创建。管理后台允许 GLY、XS、YY 登录，其中 YY 只能进入商品管理和分类管理；商品和分类的增删改都会记录到操作日志，日志页面仅 GLY 可查看。

**视频上传失败 / 超时**
确认云函数超时为 60 秒、内存 512MB；视频控制在 40MB 内；失败后重新上传会产生新的临时分片。

**上传时报 EXCEED_MAX_PAYLOAD_SIZE**
说明请求体被网关按文本 JSON 处理了。新版管理端已改为二进制上传和 2MB 分片；请确认管理端已重新构建，且不要把图片/视频重新改回 base64 JSON 方式。

**管理端提示“未配置接口地址”**
把 `admin/.env.example` 复制为 `admin/.env`，填写 `VITE_API_BASE`，重启 `npm run dev`。

**小程序码生成失败**
确认云函数已重新部署（`config.json` 权限生效）、所选版本正确；未发布时只能选体验版，且扫码人需为体验成员。

**客户反馈搜不到小程序**
这是预期行为：公众平台已关闭“允许被搜索”，可通过小程序码或分享卡片进入。

## 后续可扩展

- 订单状态流转（待确认、已发货、已完成）与物流单号
- 库存、多规格 SKU、优惠券
- 客户标签、生日、跟进记录
- 销售工作台与客户分配
- 订阅消息通知新订单/订单状态
- 订单导出 Excel、经营数据看板
