# 商品订单微信小程序

一个用于商品展示和订单记录的小程序：**不开放搜索、不接在线支付**，可通过小程序码进入。客户用手机号登录后浏览、加购物车、下单；管理员在 Web 管理后台维护商品、用户、订单和客户。

## 功能

客户侧（微信小程序）：

- 进入小程序必须手机号 + 密码登录，未登录不能查看商品
- 暂时隐藏首页，只保留三个 Tab：全部商品、购物车、我的
- 全部商品：分类筛选、商品名称搜索；服务端分页，每页 10 条，滚动加载；不提供销量/最新排序和客服入口
- 商品详情：多图预览、视频播放、规格型号/生产日期/产地、加入购物车；商品列表和详情展示售价、划线原价和优惠金额
- 加购弹窗：可直接输入或加减数量，一次加入多件
- 商品详情底部提供购物车快捷入口和数量角标
- 购物车：勾选、改数量、移除、全选、批量结算
- 多店铺：一个客户可维护多个店铺；商品页/购物车可切换当前店铺，购物车按店铺隔离，结算使用当前店铺的收货地址；订单保存店铺快照
- 客户可售范围：后台可为客户绑定分类；未绑定则看到全部分类商品，绑定后仅看到这些分类下的商品
- 下单：多商品订单、收货地址、备注，无需在线支付；客户 `KH` 和销售 `XS` 可加购和下单
- 我的：个人资料、修改密码；`KH` 显示“我的订单”，销售显示“我的客户 / 我的订单 / 客户订单”，管理员显示“客户订单”
- 我的订单：服务端分页，每页 10 条，滚动加载；客户可取消状态为“已完成”的订单，取消后回滚商品销量；支持“再来一单”，可修改数量后重新提交
- 客户订单：销售查看自己客户的订单，管理员查看全部订单；支持客户下拉筛选、店铺筛选、今天/昨天/最近一周和月份选择（最近 12 个月）；管理员可按销售筛选并显示所属销售；支持勾选订单后导出 Excel
- 订单状态：`DONE` 已完成（默认，客户可取消）、`CLOSED` 已关闭（管理员关闭，订单结束，不再允许取消）、`CANCELLED` 已取消（回滚销量）
- 销售演示：销售账号可正常加购、下单；演示订单标记 `isDemo`，不计入商品销量、数据报表、客户统计和销售业绩，销售可在“我的订单”中查看
- 我的客户（销售）：客户搜索、本月已下单/未下单筛选、客户数/本月交易额/本月下单次数统计，客户卡片显示名下多个店铺、当月交易额、当月下单数、较上月变化，并提供“帮下单”入口
- 帮下单：销售可为自己的客户选择店铺后加入购物车或直接创建订单，商品范围按该客户的分类绑定校验；订单记录来源为“客户自建”或“销售帮下单”
- 小程序码：可打开全部商品页或指定商品

店主侧（Web 管理后台）：

- 手机号 + 密码登录；首次部署初始化管理员
- 管理员、运营与销售均可登录后台；销售只能查看自己关联客户的数据，并可在客户菜单新建自己的客户
- 用户管理：客户（KH）/ 销售（XS）/ 运营（YY）/ 管理员（GLY）
  - 客户类型必须创建首个店铺并填写收货地址，同时指定负责销售；后续可在店铺管理中增加多个店铺
  - 可为客户绑定可售分类；不绑定表示可查看全部分类商品
  - 支持停用账号、修改密码（自定义新密码）、重置密码（默认重置为 `123456`）
  - 删除用户/客户为逻辑删除，需二次确认：账号从列表隐藏并禁止登录，历史订单保留；客户的店铺和购物车会清理，销售名下客户会解除分配
- 订单管理：按状态（已完成/已关闭/已取消）、订单类型（正式/演示/全部，默认正式）、销售、店铺、关键词筛选，列表显示负责销售和订单来源；管理员可关闭订单（订单结束、保留销量）、取消订单（回滚销量）或删除订单（二次确认，删除前未取消的正式订单会回滚销量），支持勾选订单后导出 Excel
- 购物车管理：按客户、销售、关键词查看购物车明细、数量和金额（销售仅自己客户）
- 商品管理：多图 + 视频、规格型号、有效期至、生产日期、产地、初始化已售数量、上下架、多分类、排序、删除；支持服务端分页、搜索和分类筛选
- 批量操作：勾选商品后可批量上架、批量下架；批量修改支持选择属性（状态/售价/原价/有效期至/生产日期/产地/规格型号/排序/商品图片），在列表中逐个商品填写或上传不同值后保存，操作写入日志
- 商品图片支持一次选择多张并并发上传（最多 4 张）；批量修改中可为每个选中商品独立上传最多 4 张图片
- 商品导入：支持 Excel/CSV，优先按「商品编码」匹配已有商品；编码不存在但名称唯一匹配无编码商品时补写编码，否则新增商品（必须有名称、售价）。新商品可选择默认分类，不选择时先作为“未分类”。导入先解析文件并统计行数，确认后按每批 10 条导入，每处理 100 条暂停 3 秒，单批失败自动重试 3 次，全部完成后再提示结果；支持 2000 行，适合云函数 3 秒超时环境
- 分类管理
- 客户汇总：按客户账号统计订单数、累计消费、最近下单、负责销售；管理员可按销售筛选；管理员和销售都可以新建客户
- 数据报表：商品采购最多/最少、客户下单最多/最少、销售业绩排行（仅管理员）
  - 默认统计今天，支持昨天、最近一周/一月/三月/半年/一年、按月份、自定义日期范围，不提供全部时间
  - 自定义范围最多跨度一年，按订单创建时间筛选
  - 支持按销售、按店铺过滤
  - 各排行只返回前 10 条；商品/客户排行只统计区间内有采购或有下单的对象，不加载全量商品和客户
- 个人中心：查看当前账号信息，修改本人登录密码；修改后当前登录保持有效，其他设备上的登录失效
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
- 数据库：users / shops / categories / products / carts / orders / settings
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
2. 右键 `cloudfunctions/api` → **上传并部署：云端安装依赖**。Excel 导出依赖 `xlsx-js-style`（支持单元格居中样式），必须使用“云端安装依赖”方式部署。
3. 云函数运行环境选择 Node.js 16.13 或更高版本。
4. 在云开发控制台 → 云函数 → `api` → 配置：
   - **超时时间：60 秒**（视频上传需要）
   - **内存：512MB**（视频分片合并需要）
   - 环境变量：
     - `TOKEN_SECRET`：登录令牌签名密钥，建议 32 位以上随机字符串
     - `SETUP_CODE`：首次初始化管理员时使用的校验码，建议独立随机字符串
5. `config.json` 已声明 `wxacode.getUnlimited` 云调用权限和 `keepWarm` 定时触发器（每 5 分钟执行一次，用于减少冷启动），修改后需重新部署。部署后在控制台确认定时触发器已创建；不需要保温时删除 `triggers` 配置即可。

### 4. 创建数据库集合

在云开发控制台 → 数据库，创建以下集合：

| 集合 | 用途 | 权限建议 |
|---|---|---|
| `users` | 用户账号（客户/销售/运营/管理员） | 所有用户不可读写 |
| `shops` | 客户店铺与收货地址（一个客户多个店铺） | 所有用户不可读写 |
| `categories` | 商品分类 | 所有用户不可读写 |
| `products` | 商品（含图片、视频） | 所有用户不可读写 |
| `carts` | 购物车（客户 + 店铺一条文档） | 所有用户不可读写 |
| `orders` | 订单 | 所有用户不可读写 |
| `settings` | 店铺设置（文档 ID `shop`） | 所有用户不可读写 |
| `audit_logs` | 操作日志（商品/分类增删改） | 所有用户不可读写 |

客户端不直接访问数据库，所有读写都经过云函数，因此八个集合都设为最严格的“所有用户不可读写”。云函数首次写日志时会尝试自动创建 `audit_logs`，也可以提前手动创建。

建议索引：

- `users`：`phone` 唯一索引（登录、手机号唯一性）
- `shops`：`userId` 升序（客户店铺列表）
- `orders`：`userId` 升序 + `createdAt` 降序（我的订单）
- `orders`：`salesId` 升序 + `createdAt` 降序（销售客户订单）
- `orders`：`shopId` 升序 + `createdAt` 降序（按店铺筛选）
- `orders`：`status` 升序 + `createdAt` 降序（后台筛选）
- `products`：`code` 唯一索引（小程序码短码）
- `products`：`productCode` 普通索引（后台商品编码搜索和导入匹配）
- `products`：`status` 升序 + `sort` 升序 + `createdAt` 降序（商品列表默认排序）
- `products`：`status` 升序 + `categoryId` 升序 + `sort` 升序 + `createdAt` 降序（分类筛选）
- `products`：`status` 升序 + `sales` 降序 + `createdAt` 降序（销量排序）
- `users`：`type` 升序 + `salesId` 升序（客户/销售筛选）
- `categories`：`sort` 升序
- `audit_logs`：`createdAt` 降序（日志列表）
- `audit_logs`：`action` 升序 + `createdAt` 降序（按操作类型筛选）
- `audit_logs`：`operatorId` 升序 + `createdAt` 降序（按操作人筛选）

`settings` 文档无需手动创建，首次保存店铺设置时会自动写入。

### 多店铺改造后的测试数据重置

本次改为 `shops` 表管理客户店铺，订单和购物车按店铺隔离，不再兼容旧的 `users.shopName/address`。测试阶段建议：

1. 云开发控制台 → 数据库 → `orders` → **清空记录**；
2. `carts` → **清空记录**；
3. 确认已创建 `shops` 集合；
4. 给每个客户创建至少一个店铺（后台用户/客户页的“店铺”按钮，或小程序“店铺管理”）；
5. 旧 `users.shopName/address` 字段可以保留，但不会再被读取，也可以手动删除。

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
3. **用户管理**：先创建销售账号（XS），再创建客户账号（KH），并给客户指定负责销售；需要限制商品范围时再为客户绑定可售分类。
4. **商品管理**：新增商品，上传图片和视频，设置售价与排序。
5. 小程序端用客户手机号登录验证。

客户账号没有自助注册，可由管理员在用户管理中创建，也可由销售在客户菜单创建；销售创建时类型固定为客户 `KH`，负责销售强制为当前销售。忘记密码可由管理员重置。

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
| 客户 | `KH` | 浏览、购物车、下单、店铺管理、查自己的订单、取消已完成订单 | 无 |
| 销售 | `XS` | 可浏览、加购、下单（演示订单不计统计），查看我的订单和名下客户多店铺的订单 | 可登录；查看自己客户的订单、客户汇总（含多店铺）、购物车；可在客户菜单新建自己的客户 |
| 运营 | `YY` | 可浏览，不能加购/下单 | 可登录；商品新增、编辑、删除和分类管理，操作写入日志 |
| 管理员 | `GLY` | 可浏览，查看全部客户订单，不能加购/下单 | 全部管理功能，可管理客户店铺、关闭或取消订单 |

- 密码使用 `scrypt` 加盐哈希存储，不保存明文。
- 小程序令牌有效期 30 天，管理后台令牌有效期 12 小时。
- 每个请求都会回查用户是否被停用；停用后旧令牌立即失效。
- 客户下单时会把 `userId`、姓名、手机号、`shopId`、店铺名称、地址、负责销售快照写入订单，方便后续追溯。
- 客户类型创建时必须填写首个店铺并选择一个销售账号作为负责销售；一个客户可以有多个店铺，订单和购物车按店铺隔离。
- 客户和销售可以加入购物车、下单；客户可取消自己状态为“已完成”的订单，管理员可关闭或取消订单；销售演示订单不计入商品销量、报表和客户统计，管理员只可浏览、不参与购物。
- 订单状态：`DONE` 已完成（默认）、`CLOSED` 已关闭（管理员结束订单，保留销量，客户不能取消）、`CANCELLED` 已取消（回滚销量）；关闭和取消均以快照记录时间。
- 演示订单（`isDemo: true`）不会增加商品销量，取消时也不回滚；报表、客户汇总、销售业绩和“我的客户”统计均会排除演示订单。
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
  "salesId": "销售账号的_id",
  "enabled": true,
  "passwordSalt": "脚本输出的值",
  "passwordHash": "脚本输出的值",
  "createdAt": 1790000000000,
  "updatedAt": 1790000000000
}
```

客户创建后，还需在 `shops` 集合插入至少一个店铺（`userId` 填客户 `_id`）：

```json
{
  "userId": "客户账号的_id",
  "shopName": "张三便利店",
  "address": "上海市静安区南京西路 100 号",
  "contactName": "张三",
  "phone": "13700000000",
  "isDefault": true,
  "enabled": true,
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
- 客户类型必须填写 `salesId`，并至少维护一个 `shops` 店铺，否则无法下单
- `categoryIds` 可选，最多绑定 100 个分类；留空表示查看全部分类商品
- 手动创建 GLY 后，后台初始化接口会认为管理员已存在，只能直接登录

## 数据模型

### users

```json
{
  "_id": "...",
  "phone": "13800138000",
  "name": "张三",
  "salesId": "销售用户的 _id",
  "categoryIds": ["分类 _id", "分类 _id"],
  "type": "KH",
  "enabled": true,
  "deleted": false,
  "shopCount": 2,
  "passwordSalt": "...",
  "passwordHash": "...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

客户的店铺和收货地址存放在 `shops` 表，一个客户可以有多个店铺；用户列表/登录接口会一并返回 `shops` 和默认店铺。旧版本遗留的 `users.shopName/address` 字段已不再读取。

PC 端删除用户为**逻辑删除**：写入 `deleted: true`、`enabled: false`，释放原手机号并清空密码；账号从列表隐藏且不能登录，但订单中的 `userId` 和历史快照保留。删除客户时会物理清理其店铺和购物车；删除销售时会解除其名下客户的销售分配。

`categoryIds` 为客户的可售分类绑定：

- 空数组或不设置：可查看全部分类下的上架商品。
- 非空数组：商品列表只查询这些分类下的商品；商品详情、购物车、结算和下单也会校验商品所属分类，不能通过直接调用接口绕过。
- 仅 `KH` 使用该字段；销售、运营和管理员不受分类绑定限制。
- 该设计避免按商品 ID 绑定大量商品，分类数量通常远小于商品数量。

### shops

```json
{
  "_id": "店铺ID",
  "userId": "客户用户ID",
  "shopName": "张三便利店",
  "address": "上海市……",
  "contactName": "张三",
  "phone": "13800138000",
  "isDefault": true,
  "enabled": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

- 一个客户最多维护 20 个店铺，至少保留一个店铺。
- 下单、购物车、订单都按店铺区分；订单会快照 `shopId`、`shopName`、`address`。
- 销售按客户维度查看名下客户的所有店铺，可在订单和帮下单时选择具体店铺。

### products

```json
{
  "_id": "...",
  "name": "手冲咖啡豆 250g",
  "productCode": "A001",
  "unit": "袋",
  "categoryId": "主分类 _id",
  "categoryIds": ["分类 _id", "分类 _id"],
  "price": 6800,
  "originalPrice": 8800,
  "images": ["cloud://..."],
  "videos": ["cloud://..."],
  "spec": "500g/袋",
  "validUntil": "2027-08-01",
  "productionDate": "2026-08-01",
  "origin": "贵州",
  "description": "产地、烘焙度、风味描述……",
  "status": "ON",
  "code": "a8k2m4xq",
  "initialSales": 100,
  "sales": 112,
  "sort": 0,
  "createdAt": "...",
  "updatedAt": "..."
}
```

价格以**分**为单位存储。`code` 是系统生成的 8 位短码，用于小程序码 `scene`；`productCode` 是后台维护的商品编码，用于导入匹配和搜索；`unit` 是商品单位（袋、盒、箱等）。`productCode` 非空时保持唯一。

`initialSales` 是后台填写的初始化已售数量，`sales` 是展示用的总已售数量，等于初始化数量加实际订单销量。后续下单会继续增加 `sales`，取消订单会回减实际订单部分；修改初始化数量时后端会按差值原子调整 `sales`。

### carts（文档 ID 为 `用户ID_店铺ID`）

```json
{
  "_id": "用户ID_店铺ID",
  "userId": "用户ID",
  "shopId": "店铺ID",
  "items": [
    { "productId": "...", "quantity": 2, "checked": true, "addedAt": "..." }
  ],
  "updatedAt": "..."
}
```

客户购物车按店铺隔离；销售演示账号使用 `shopId = demo` 的购物车。购物车只存商品 ID 和数量，商品名称、价格、规格、上下架状态每次进入购物车或刷新时都从 `products` 表实时读取；订单在创建时再保存价格和规格快照。

### orders

```json
{
  "_id": "...",
  "orderNo": "M2026102115301234",
  "userId": "用户ID",
  "openid": "微信openid（审计用）",
  "items": [
    { "productId": "...", "productCode": "A001", "name": "手冲咖啡豆 250g", "spec": "500g/袋", "price": 6800, "quantity": 2, "image": "cloud://..." }
  ],
  "totalAmount": 13600,
  "customerName": "张三",
  "phone": "13800138000",
  "shopId": "店铺ID",
  "shopName": "张三便利店",
  "address": "上海市……",
  "salesId": "销售用户ID",
  "salesName": "李销售",
  "remark": "周末发货",
  "source": "cart",
  "orderSource": "SELF",
  "isDemo": false,
  "status": "DONE",
  "createdAt": "...",
  "updatedAt": "..."
}
```

下单即 `DONE`（已完成）。管理员可将 `DONE` 订单关闭为 `CLOSED`（订单结束、保留销量、客户不能再取消）；客户可将自己的 `DONE` 订单取消为 `CANCELLED` 并回滚销量；管理员取消也按 `CANCELLED` 处理并回滚销量。已关闭和已取消均为终态。

订单来源字段：

- `orderSource: "SELF"`：客户自己下单。
- `orderSource: "ASSIST"`：销售帮下单，同时记录 `assistedById`、`assistedByName`。
- `isDemo: true`：销售账号演示下单，不增加商品销量，不计入报表、客户统计、销售业绩和“我的客户”统计；取消时也不回滚销量。
- 旧订单未存 `orderSource` 时按“客户自建”展示，未存 `isDemo` 时按正式订单处理。

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
- `XS`：只能访问 `/me`、订单查询（自动限制为自己负责的订单）、客户汇总（自动限制为自己客户）、新建客户（强制 `KH` 且负责销售为自己）、购物车查询（自动限制为自己客户）
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
| POST | `/users` | 新增用户（GLY；KH 必填首个店铺名称/地址、负责销售，可选 `categoryIds`） |
| PUT | `/users/:id` | 修改用户/分配销售/停用/绑定可售分类（GLY） |
| GET | `/users/:id/shops` | 客户店铺列表（GLY） |
| POST | `/users/:id/shops` | 新增客户店铺（GLY） |
| PUT | `/users/:id/shops/:shopId` | 编辑客户店铺（GLY） |
| DELETE | `/users/:id/shops/:shopId` | 删除客户店铺（GLY，至少保留一个） |
| POST | `/users/:id/shops/:shopId/default` | 设置默认店铺（GLY） |
| POST | `/users/:id/password` | 修改/重置用户密码（GLY；传 `password` 则使用指定密码，未传默认 `123456`） |
| DELETE | `/users/:id` | 逻辑删除用户（GLY；不能删除自己；账号隐藏并禁止登录，订单保留；客户的店铺/购物车清理，销售名下客户解除分配） |
| POST | `/me/password` | 修改当前登录账号密码（GLY / XS / YY；需原密码，返回新 token） |
| GET | `/orders?status=&orderType=&salesId=&shopId=&keyword=&page=&pageSize=` | 订单列表（XS 自动按自己过滤；`orderType` 取 `normal`/`demo`/`all`，默认 `normal`，PC 端默认不展示销售演示订单） |
| GET | `/orders/export?ids=` | 按勾选订单 ID 导出 Excel（XS 自动校验自己的订单，最多 100 单；明细包含商品编码、商品名称、规格、数量、单价等） |
| GET | `/orders/:id` | 订单详情（XS 只能看自己的订单） |
| PATCH | `/orders/:id` | 修改订单状态（GLY；body `{"status":"CLOSED"}` 关闭订单、`"CANCELLED"` 取消并回滚销量） |
| DELETE | `/orders/:id` | 删除订单（GLY；二次确认后前端调用；未取消的正式订单会回滚销量） |
| GET | `/carts?keyword=&salesId=&page=&pageSize=` | 客户购物车列表（按客户+店铺展示，XS 自动过滤，GLY 可按销售筛选） |
| GET | `/shops?keyword=` | 店铺列表（XS 只返回自己客户的店铺，GLY 返回全部；用于订单/报表筛选） |
| GET | `/products?page=&pageSize=&keyword=&categoryId=&ids=&simple=` | 商品分页列表（GLY / YY；`ids` 用于批量回显，最多 100 个；`simple=1` 跳过临时地址生成，供选择器使用） |
| POST | `/products` | 新增商品（GLY） |
| PUT | `/products/:id` | 更新商品（GLY / YY） |
| DELETE | `/products/:id` | 删除商品（GLY） |
| POST | `/products/batch` | 批量修改商品（GLY / YY；最多 100 件；支持 `field` + `updates:[{id,value}]` 逐商品更新，或 `ids` + `value` 统一更新） |
| POST | `/products/import` | 商品导入（GLY / YY；`metaOnly` 统计行数和重复编码；`rowOffset` + `rowLimit` 分批导入，`defaultCategoryId` 可选；按商品编码匹配，不存在则新增，空字段不更新，最多 2000 行） |
| GET | `/categories` | 分类列表（GLY / YY） |
| POST / PUT / DELETE | `/categories`、`/categories/:id` | 分类维护（GLY / YY） |
| GET | `/customers?salesId=` | 客户汇总（XS 自动按自己过滤，GLY 可按销售筛选） |
| POST | `/customers` | 新建客户（GLY / XS；类型固定 `KH`，XS 的负责销售强制为自己） |
| GET | `/reports?start=&end=&salesId=&shopId=&shopName=` | 数据报表（GLY；start/end 为毫秒时间戳，默认今天，跨度最多一年；支持按销售、店铺过滤） |
| GET | `/audit-logs?page=&pageSize=&action=&keyword=&resource=&resourceId=&start=&end=` | 操作日志（GLY；支持操作类型、商品/分类名称、资源和 ID 筛选；默认最近 7 天，最长 14 天） |
| GET / PUT | `/settings` | 店铺设置（GLY） |
| POST | `/upload` | 上传图片（二进制，GLY / YY） |
| POST | `/upload/chunk?uploadId=&index=&totalChunks=` | 上传视频分片（二进制，GLY / YY） |
| POST | `/upload/video` | 合并视频分片（JSON，GLY / YY） |
| POST | `/qrcode` | 生成小程序码（GLY） |

小程序端 `action`：

- 公开：`login`、`getSettings`、`ping`
- 需登录：`getHome`、`getCatalog`、`listProducts`、`getProduct`、`me`、`listMyShops`、`createShop`、`updateShop`、`deleteShop`、`setDefaultShop`、`updateProfile`、`changePassword`、`getCart`、`addToCart`、`updateCartItem`、`setCartCheckedAll`、`removeCartItem`、`getCheckoutPreview`、`createOrder`、`listMyOrders`、`listStaffOrders`、`exportStaffOrders`、`listSalesOptions`、`listCustomerOptions`、`listCustomerShops`、`listMyCustomers`、`getAssistCustomer`、`assistAddToCart`、`assistCreateOrder`、`getMyOrder`、`cancelMyOrder`
- `getHome`：首页聚合接口，一次返回店铺信息、分类、首页 10 个商品以及客户店铺列表，减少首屏云调用次数
- 店铺接口：`listMyShops`、`createShop`、`updateShop`、`deleteShop`、`setDefaultShop` 仅客户 `KH` 可用；一个客户最多 20 个店铺，至少保留一个
- 购物车接口 `getCart`、`addToCart`、`updateCartItem`、`setCartCheckedAll`、`removeCartItem` 需要传 `shopId`（客户），销售演示订单不传，使用 `demo` 购物车；结算、下单同样需要 `shopId`
- `getCatalog` 默认返回店铺信息、分类和全部商品；传 `includeProducts: false` 时只返回店铺信息和分类，供商品页首屏使用
- `listProducts` 参数：`page`、`categoryId`、`keyword`、`sort`；小程序只按商品名称搜索，`sort` 当前固定默认排序；固定每页 10 条，返回 `list` 和 `hasMore`，不查询总数
- `listMyOrders` 参数：`page`、`pageSize`、`shopId`（可选，按店铺筛选），返回 `list` 和 `hasMore`，不查询总数；`KH` 查自己的订单，`XS` 查自己的演示订单
- `cancelMyOrder`：仅 `KH`，只能取消自己状态为 `DONE` 的订单，取消后回滚商品销量；`CLOSED` 和 `CANCELLED` 不可再取消
- `listStaffOrders` 参数：`page`、`pageSize`、`start`、`end`、`customerId`、`shopId`、`salesId`；仅 `XS` / `GLY`，销售强制只查自己的订单，管理员可按销售筛选；时间跨度最多一年
- `exportStaffOrders`：传入勾选订单 `ids` 数组导出 Excel，返回 `base64` 和文件名；销售只能导出自己的订单，最多 100 单；明细包含商品编码、商品名称、规格、数量、单价等
- `listCustomerOptions`：`XS` 返回自己的客户及店铺列表，`GLY` 返回全部客户，供订单客户下拉筛选
- `listCustomerShops`：`XS` / `GLY` 查询指定客户的店铺，供订单店铺筛选和帮下单选择
- `listMyCustomers`：仅 `XS`，返回当前销售名下客户的本月交易额、本月下单数、上月对比、汇总和客户店铺列表
- `getAssistCustomer` / `assistAddToCart` / `assistCreateOrder`：仅 `XS`，只能操作自己名下客户；必须传客户的 `shopId`，帮下单订单记录 `orderSource: "ASSIST"` 和店铺快照
- `listProducts` 传入 `customerId` 时，销售帮下单会按该客户的分类绑定过滤商品
- `listSalesOptions`：仅 `GLY`，返回启用中的销售列表，供小程序订单筛选
- `getMyOrder`：客户只能查看自己的订单，销售可以查看自己负责的客户订单和自己的演示订单，管理员可查看全部；运营不可查看
- 购物车操作、结算、下单允许 `KH` 和 `XS`（`XS` 生成的订单标记 `isDemo`，不计入销量和统计）；其他角色调用会返回业务错误

## 安全说明

- 八个集合对客户端完全关闭，仅云函数可读写。
- 密码使用 `scrypt` 加盐哈希；登录令牌使用 HMAC-SHA256 签名。
- 商品价格、订单金额全部在云函数中按数据库价格重新计算，不信任客户端传值。
- 客户只能查询自己的订单（按 `userId` 校验）。
- 销售后台权限在服务端校验，不能通过修改前端菜单越权；订单、客户、购物车均按销售归属过滤。
- 管理员不能停用自己，也不能修改自己的管理员类型，避免把后台锁死。
- 重置密码默认 `123456`，首次登录后应尽快修改；后台登录账号可在“个人中心”修改本人密码。
- 初始化接口只有在系统没有管理员时才可用，并且需要 `SETUP_CODE`。
- 不要把 `admin/.env` 和云函数环境变量提交到代码仓库。
- 云存储旧图片/视频在删除商品时不会自动清理，可在控制台定期清理；`mall/tmp/` 下的中断分片同理。

## 已知限制

- 没有在线支付，订单提交即完成；取消订单只能由管理员操作。
- 没有库存与多规格，超卖风险由店主人工把控。
- 客户账号由管理员创建，不提供自助注册。
- 销售可登录后台，查看自己客户的订单、客户汇总和购物车，并可在客户菜单新建自己的客户；不能管理商品、其他用户或修改客户归属。
- 销售订单按订单创建时的负责销售快照过滤；如果客户被重新分配，历史订单仍归属原销售。
- 购物车列表支持按销售筛选，最多读取 500 条购物车和 1000 位用户；商品名称按购物车中的商品 ID 精确批量查询，不受商品总数限制。
- 首页暂时隐藏，只保留三个 Tab；二维码的“全部商品页”指向 `pages/products/index`。
- 商品支持多个分类，`categoryIds` 为完整分类列表，`categoryId` 保留为第一个主分类以兼容旧数据；旧商品没有 `categoryIds` 时按 `[categoryId]` 处理。
- 商品规格型号、有效期至、生产日期、产地当前按文本存储，日期由后台日期选择器生成 `YYYY-MM-DD`。
- 小程序商品列表和详情展示有效期至；详情参数顺序为规格型号、有效期至、生产日期、产地。
- “再来一单”会按当前商品价格重新结算；如果订单里有已删除或已下架商品，会提示无法结算。
- 单笔订单最多 20 种商品；购物车单项数量 1-99。
- 视频单个上限 40MB，超时时间依赖云函数配置。
- 客户汇总最多统计 1000 位客户与最近 1000 条已完成订单。
- 数据报表基于所选时间范围内最多 3000 条已完成订单聚合，不再加载全量用户和商品；商品采购最少、客户下单最少只统计区间内有采购或有下单的对象，各排行返回前 10 条。
- 云函数低频访问存在冷启动，首次请求可能慢 1–3 秒；首页已改为单次 `getHome` 聚合请求并做本地缓存，后续进入先展示缓存再后台刷新，`keepWarm` 触发器用于降低冷启动概率。
- 当前版本已完成静态校验、管理端构建和浏览器 mock 回归，**尚未在真实云环境、微信开发者工具中联调**。

## 常见问题

**提示“数据库集合未创建”**
按第 4 步创建八个集合。

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
- 经营数据看板
