# Cloudflare Workers + D1 部署指南

> Docker 部署见 README 的 Docker 章节。本指南与 Docker 完全分开：Cloudflare 不使用 `dist/server/node.js`，不需要 `pnpm build:docker`，Workers 运行入口仍是 `src/server/worker.ts`，静态资源目录是 `dist/client`。

## 前置条件

- 一个 Cloudflare 账号
- Git、Node.js 22+（pnpm 与 wrangler 都无需单独安装：pnpm 由 Node 自带的 corepack 提供，wrangler 是项目内依赖，统一用 `pnpm exec wrangler` 调用）

## 步骤

### 0. 获取代码并安装依赖

```bash
git clone <仓库地址> navi
cd navi
corepack enable    # 之后 pnpm 命令会自动使用项目钉定的版本
pnpm install
```

> 后续所有步骤都依赖这一步：`pnpm build`、`pnpm exec wrangler` 均需要依赖已安装。

### 1. 登录 Cloudflare 并创建 D1 数据库

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create navi
```

`d1 create` 会输出 `database_id`。打开 `wrangler.toml`，把 `[[d1_databases]]` 下的 `database_id = "REPLACE_ME"` 替换为你刚拿到的值。

> 不替换的话部署会直接报错——D1 的 database ID 只在其所属账号内有效，占位符或他人的 ID 都无法通过校验。

### 2. 应用迁移

`wrangler.toml` 已配置 `migrations_dir = "src/db/migrations"`（复用 drizzle 生成的迁移目录），wrangler 会直接读取其中的 SQL 文件，并用自建的 `d1_migrations` 表跟踪已应用项。

先在本地校验（使用本地模拟 D1，数据落在 `.wrangler/`，与远程完全隔离）：

```bash
pnpm exec wrangler d1 migrations apply navi --local
```

确认成功后应用到远程：

```bash
pnpm exec wrangler d1 migrations apply navi --remote
```

> **若报错 `No migrations present at .../migrations`**：说明 `migrations_dir` 未生效——确认 `wrangler.toml` 的 D1 绑定下有 `migrations_dir = "src/db/migrations"`。
>
> **备选（直接执行 SQL，不走迁移跟踪）**：
> ```bash
> pnpm exec wrangler d1 execute navi --remote --file src/db/migrations/<迁移文件>.sql
> ```
> 注意：这种方式不写 `d1_migrations` 记录，后续 `migrations apply` 可能重复执行已应用的迁移，仅作排障用。

### 3. 构建前端

```bash
pnpm build
```

`pnpm build` 等价于 `build:web`（见 `package.json`），只构建 Cloudflare 需要的 `dist/client`，**不构建后端 bundle**。

### 4. 部署

```bash
pnpm exec wrangler deploy --env=""
```

部署后 Wrangler 会输出 Workers URL（如 `https://navi.<你的子域>.workers.dev`）。

> `--env=""` 显式指定「顶层（生产）环境」。因为 `wrangler.toml` 里定义了 `[env.staging]` 预发分段，
> 不带 `--env` 时 wrangler 会告警「定义了多个环境但未指定目标」——虽仍按顶层部署，但显式写出可避免
> 打错环境。预发部署见下方「预发环境」一节。

## 验证

访问 Workers URL：

- 未初始化时重定向到 `/setup`（首启向导）
- 创建首个管理员后可登录使用

> ⚠️ **部署完成后请立即完成首启向导**：在首个管理员创建之前，任何访问到该 URL 的人都可以把自己注册成管理员。workers.dev 地址部署完即公网可达，不要部署完就搁置。

API 路由的处理逻辑见 `src/server/worker.ts`：`/api` 与 `/api/*` 由 Worker 处理，其余路径交给 `ASSETS`（前端 SPA，`not_found_handling = "single-page-application"`）。

## 注意事项

### 运行时配置（不可随意改动 `wrangler.toml`）

- `compatibility_date` 与 `compatibility_flags = ["nodejs_compat"]` 是 Workers 运行后端代码的必要条件，**删掉 `nodejs_compat` 会导致 Worker 启动失败**
- `[assets]` 的 `directory = "dist/client"` 指向前端产物；部署前必须已执行 `pnpm build`
- D1 绑定名 `DB` 与代码 `worker.ts` 里的 `env.DB` 对应，改绑定名需同步改代码

### 预发环境（可选，推荐）

`wrangler.toml` 里的 `[env.staging]` 是一个与生产**完全隔离的 Worker（`navi-staging`）+ 独立 D1 库**，用于验证迁移和部署，不必拿生产库试。

首次启用需另建一个库，并把输出的 id 填进 `[[env.staging.d1_databases]]` 的 `database_id`：

```bash
pnpm exec wrangler d1 create navi-staging
```

之后预发的迁移与部署（注意每条都要带 `--env staging`）：

```bash
pnpm exec wrangler d1 migrations apply navi-staging --env staging --remote
pnpm build && pnpm exec wrangler deploy --env staging
```

> **`--env` 漏写就会打到生产**。定义了具名环境后，不带 `--env` 的 `wrangler deploy` 会告警提示目标不明确，生产部署请显式写 `--env=""`。
>
> wrangler 的分段继承语义（4.112 实测）：`d1_databases` **不继承**顶层，所以分段内重新声明了一份——这正是隔离的关键，绝不能让预发回落到生产库；`assets` / `observability` **会继承**，故未重复声明。
>
> 预发同样是公网可达且未初始化状态，部署后请立即完成首启向导或及时删除，否则任何人可注册成管理员。

### 可观测性

`[observability] enabled = true` 已显式开启，线上报错可在 Cloudflare dashboard 事后查询，不必只靠 `wrangler tail` 实时盯。日志有保留期限，排查线上问题不要拖太久。

### 会话 cookie

Workers 上 `secureCookie` 在 `src/server/worker.ts` 中**硬编码为 `true`**（不是基于环境变量的默认值）。Workers 默认走 HTTPS，所以正常工作；如需关闭（不推荐，仅自定义域名走 HTTP 的极端场景），需改源码。Cloudflare 不像 Docker 那样提供 `SECURE_COOKIES` 环境变量开关。

### 抓取与 SSRF

Workers 上抓取调用平台原生 `fetch`（`worker.ts` 的 `fetchImpl: fetch`），无 Node 侧 DNS lookup 复核，DNS rebinding 防御依赖 Cloudflare 平台出口限制 + 字面量 SSRF 校验。这与 Docker 侧（`src/server/node.ts` 用 `dnsLookup` 复核私网）不同。

### 数据持久化

D1 数据库与 Worker 部署互相独立——重新 `wrangler deploy` 不会动数据；只有执行 `migrations apply` 或 `d1 execute` 才改库。

### 数据备份

```bash
pnpm exec wrangler d1 export navi --remote --output navi-backup.sql
```

导出为 SQL 文件，可用于恢复或迁移到 Docker 侧的 SQLite。

## 升级

1. `git pull && pnpm install`（依赖可能有变化）
2. `pnpm exec wrangler d1 migrations apply navi --remote`（无新迁移时该命令是空操作，直接执行即可）
3. `pnpm build && pnpm exec wrangler deploy --env=""`

> 有预发环境时，建议先在预发跑一遍第 2、3 步（把 `navi` 换成 `navi-staging`、加 `--env staging`），确认迁移无误再动生产。
