# Navi

极简个人导航页 — 搜索起始页 + 标签化书签管理，支持自托管（Docker）与 Cloudflare（Workers + D1）双栈部署。

## 特性

- **双栈部署**：Docker（Node + SQLite）自托管 / Cloudflare Workers + D1 无服务器
- **搜索首页**：居中网页搜索（可配多引擎切换）+ 左下最近访问 + 右侧浮层级联标签选择器 + 模糊搜索 + 多维排序分页卡片网格
- **层级标签**：父标签自动包含子集；多选交集筛选；级联删除
- **抓取增强**：HTTP 获取 favicon/标题/描述（含 SSRF 防护）
- **批量操作**：批量删除、批量打标签；网址启用/停用
- **导入导出**：完整 JSON 备份（merge/replace）+ Netscape HTML 浏览器书签导入导出；导入导出前需当前密码二次确认
- **个性化**：自定义 / Bing 每日背景图（明暗独立透明度）、个性签名（支持加粗/斜体/删除线/颜色标记）、背景音乐播放器
- **多账号**：账号隔离；多管理员；首启向导
- **键盘快捷键**：`/`·`⌘/Ctrl+K` 网页搜索、`s` 站内搜索、`n` 新增网址、方向键浏览卡片、`p` 播放/暂停、`?` 帮助
- **可安装应用**：提供 Web App Manifest 与多尺寸图标，可从支持的浏览器安装到桌面或主屏幕
- **国际化**：中文/英文；黑暗模式（跟随系统 + 手动切换）

## 快速开始

### Docker（推荐自托管）

#### 一、准备
- 已安装 Docker 与 Docker Compose（建议 Docker Engine 20+、Compose v2+）
- 本地无需预装 Node.js —— 构建在镜像内完成，完整克隆仓库即可

#### 二、启动
```bash
# 克隆仓库
git clone <your-repo-url> navi
cd navi

# 一键启动：自动构建镜像 + 运行容器，数据落到仓库下的 ./navi-data 目录
docker compose up -d

# 访问 http://localhost:8787
```

首次访问将引导创建管理员账号。

> ⚠️ 若部署在公网（VPS 等），**启动后请立即完成首启向导**：在首个管理员创建之前，任何访问到该地址的人都可以把自己注册成管理员。

#### 三、构建与运行机制
- 构建阶段（`Dockerfile` 的 `build` 层）执行 `pnpm build:docker`，同时生成前端静态资源 `dist/client` 和后端 bundle `dist/server/node.js`（内联全部 JS 依赖），并把 `src/db/migrations` 拷贝到 `dist/server/migrations`
- 运行阶段（`runtime` 层）只安装 bundle 唯一的外部依赖——原生模块 `better-sqlite3`（精确版本钉死在 `docker/package.runtime.json`），然后直接 `node dist/server/node.js`，**不经过 tsx / pnpm script**
- 容器以 root 进入 entrypoint，把 `/data` 交给 `node` 用户后**降权运行**服务进程（`docker/entrypoint.sh`）
- 容器启动时会自动应用 SQLite 迁移（`runMigrations`），无需手动建表；镜像内置健康检查（`/api/health`）与 `sqlite3` CLI（供在线备份）

#### 四、数据持久化
`docker-compose.yml` 用**绑定挂载** `./navi-data:/data`（不是命名卷）：宿主机仓库目录下会出现 `navi-data/` 文件夹，`navi.sqlite` 存于其中。
```bash
docker compose down      # 停止容器，数据保留
docker compose up -d     # 重新启动
```
> 注意：因为是绑定挂载，`docker compose down -v` **不会**清除数据；要彻底删数据需手动删除 `./navi-data` 目录。若直接 `docker run` 镜像而不走 compose，数据会落到 Docker 匿名卷 `/data`（Dockerfile 声明的 `VOLUME ["/data"]`），不建议这样用——始终通过 compose 启动更省心。

#### 五、环境变量
`docker-compose.yml` 默认配置如下，列出全部可调项：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8787` | 容器监听端口；改了要同步改 `ports` 映射 |
| `NODE_ENV` | `production` | 影响 secure cookie 的默认回退（见下） |
| `SECURE_COOKIES` | `false` | 是否给会话 cookie 加 `Secure` 属性 |
| `DATABASE_FILE` | `/data/navi.sqlite` | SQLite 文件路径；通常无需改 |

**`SECURE_COOKIES` 取值规则**（`src/server/config.ts`）：
- 显式设为 `true` → cookie 带 `Secure`
- 显式设为 `false` → 不带 `Secure`（HTTP / 局域网访问用这个）
- **不设置** → 回退看 `NODE_ENV`，Docker 默认 `production` → 会变成 `true`

> 因此通过 `http://` 访问时，务必保留 `SECURE_COOKIES: 'false'`，否则即便登录成功 cookie 也不会下发，表现为「登录后仍跳回登录页」。

#### 六、反向代理 / HTTPS
若部署在 HTTPS 反向代理（Nginx / Caddy / Traefik）后：
1. 把 `SECURE_COOKIES` 改为 `'true'`，让会话 cookie 带 `Secure`（应用不读取 `X-Forwarded-*` 头，Secure 与否完全由该变量控制）
2. TLS 在反代侧终止，容器继续走 HTTP 即可
3. `docker-compose.yml` 的 `ports` 可改为仅监听本机（如 `127.0.0.1:8787:8787`），由反代统一对外

#### 七、常用操作
```bash
docker compose up -d             # 启动容器
docker compose up -d --build     # 重建镜像并启动（升级 / 改代码后）
docker compose logs -f navi      # 查看实时日志
docker compose down              # 停止容器（保留数据）
```
> 排障时如怀疑构建缓存脏了，可用 `docker compose build --no-cache` 全量重建（会重新下载全部依赖，较慢，日常升级不需要）。

#### 八、数据备份与恢复（WAL 模式注意点）
SQLite 启用 WAL 模式，直接拷贝 `navi.sqlite` 可能与 `navi.sqlite-wal` 不一致。推荐方式：
```bash
# 方式 A：停容器后再拷（最简单）
docker compose down
cp navi-data/navi.sqlite navi-backup-$(date +%F).sqlite
docker compose up -d

# 方式 B：在线热备（不停服务，用 sqlite3 的 .backup）
docker compose exec navi sqlite3 /data/navi.sqlite ".backup '/data/navi-backup.sqlite'"
# 备份文件落在容器 /data，对应宿主机 ./navi-data/navi-backup.sqlite
```
恢复：停容器 → 用备份文件覆盖 `navi-data/navi.sqlite`（同时删掉 `navi.sqlite-wal` / `navi.sqlite-shm`）→ 重启。

#### 九、升级
```bash
git pull
docker compose up -d --build
```
> 使用预构建镜像（见下节）时改为 `docker compose pull && docker compose up -d`。

#### 十、使用预构建镜像（可选）
默认 `docker compose up` 在本地构建镜像（对机器内存有一定要求，前端构建在小内存 VPS 上可能吃紧）。若仓库所在的 Git 服务已启用容器镜像仓库并配置了发布工作流（`.github/workflows/docker-publish.yml`，推送 `v*` tag 触发），可直接拉取预构建镜像：把 `docker-compose.yml` 里的 `build: .` 注释掉、取消注释 `image:` 行，然后 `docker compose pull && docker compose up -d`。

#### 十一、构建上下文说明（`.dockerignore`）
依赖目录、构建产物、本地数据库、`navi-data/` 数据目录、文档与测试等均不进入构建上下文（完整清单以 `.dockerignore` 文件为准），修改这些内容不会影响 Docker 构建 / 运行。

### Cloudflare Workers + D1

Cloudflare 路径与 Docker 完全分开：
- 只需要前端构建产物 `dist/client`
- Workers 入口仍然直接使用 `src/server/worker.ts`
- D1 迁移由 Wrangler 按 `src/db/migrations` 执行

基础发布流程（依赖已 `pnpm install`）：
```bash
pnpm build
pnpm exec wrangler deploy --env=""
```

> `--env=""` 显式指向顶层（生产）环境。`wrangler.toml` 里另有 `[env.staging]` 预发环境，定义具名环境后不带 `--env` 会告警提示目标不明确。

首次部署前还需要安装依赖、创建并迁移 D1，完整步骤见 [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md)。

## 开发

### 环境
- Node.js 22+
- pnpm 10（`corepack enable` 后会自动使用 `package.json` 里 `packageManager` 钉定的版本，无需单独安装）

### 本地运行
```bash
pnpm install

# 后端 API（含迁移 + 托管前端 SPA；托管的是 dist/client 构建产物，需先 build 一次）
pnpm build && pnpm dev
# 前端热更新（可选，开发前端时使用，免重复 build）
pnpm dev:web

# 访问 http://localhost:8787（dev）或 http://localhost:5173（dev:web + API 代理）
```

### 脚本
```bash
pnpm build          # Cloudflare / 通用前端构建到 dist/client
pnpm build:server   # 打包后端 Node 产物到 dist/server
pnpm build:docker   # Docker 构建：前端 + 后端
pnpm typecheck      # 后端 TypeScript 检查
pnpm typecheck:web  # 前端 vue-tsc 检查
pnpm test               # 后端单元 + 集成测试（Vitest）
pnpm test:web       # 前端组件测试（Vitest + jsdom）
pnpm lint           # ESLint
pnpm format         # Prettier 格式化
pnpm db:generate    # 生成 Drizzle 迁移
```

### 架构
- **后端**：Hono + Drizzle ORM（SQLite 方言，数据层全异步，兼容 better-sqlite3 与 D1）
- **前端**：Vue 3 + Vite + Vue Router + Pinia + vue-i18n + Tailwind（具体版本以 `package.json` 为准）
- **数据库**：better-sqlite3（Node）/ D1（Workers）；7 表（users / user_prefs / sessions / search_engines / bookmarks / tags / bookmark_tags），无 DB 外键（手动管理）
- **测试**：Vitest；后端覆盖 services / routes / 端到端集成，前端覆盖关键组件，CI 两者都跑
- **安全**：PBKDF2 密码哈希、CSRF（同源校验）、会话 cookie（httpOnly + SameSite=Lax，30 天滑动续期）、登录限流、SSRF 防御、导入导出前当前密码二次校验

## 文档
- [需求文档](docs/需求文档.md) — 功能需求、角色、首页布局
- [技术文档](docs/技术文档.md) — 技术栈、数据模型、API、架构

## 许可

[MIT](LICENSE)

## 鸣谢

由 [Claude Code](https://claude.ai/code) 协同开发。
