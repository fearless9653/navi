# CLAUDE.md

> 本文件是给 Claude Code 的**操作手册**：怎么在本仓库干活、哪些红线不能碰。
> 详尽的架构说明不在这里——去读 `docs/技术文档.md`（下方「文档地图」）。改动架构后两边都要同步。

## 一、项目是什么

**Navi** — 极简个人导航页：搜索起始页 + 标签化书签管理。

一份代码，**双栈完全对等**部署：

- **Docker / 自托管**：Node（`@hono/node-server`）+ better-sqlite3，入口 `src/server/node.ts`
- **Cloudflare**：Workers + D1，入口 `src/server/worker.ts`

技术栈：Hono · Drizzle ORM（SQLite 方言）· Zod · Vue 3 + Vite + Pinia + vue-i18n + Tailwind v4（具体版本以 `package.json` 为准）。Node ≥ 22。

## 二、命令

**包管理器只用 pnpm**（`packageManager` 锁定 pnpm@10）。**禁止** `npm install` / `npm i` / `yarn`——会生成 `package-lock.json` 与 pnpm-lock.yaml 冲突，破坏 CI 与 Docker 的 `--frozen-lockfile` 构建。装依赖一律 `pnpm add [-D]`，跑脚本一律 `pnpm <script>`。
（注：`.claude/settings.local.json` 里历史遗留了 `npm run *` 的放行项，别当成许可——仍然只用 pnpm。唯一例外：`Dockerfile` 的 runtime 层对 `docker/package.runtime.json` **刻意用 npm** 安装——那是镜像内的独立 package.json，不涉及本仓库 lockfile，别「修正」成 pnpm。）

```bash
pnpm check            # ★ 提交前门禁：typecheck + typecheck:web + lint + test:all（CI 同款，先跑这个）
pnpm build && pnpm dev   # 常用本地调试：先构建前端，再起后端（托管构建产物）→ http://localhost:8787
pnpm dev              # 仅后端 API（tsx watch，含迁移 + 托管前端）→ http://localhost:8787
pnpm dev:web          # 仅前端热更新（Vite + API 代理）→ http://localhost:5173；改前端时用它，免重复 build
pnpm db:generate      # 改 src/db/schema.ts 后生成 Drizzle 迁移 + 快照
```

单测调试：`pnpm vitest run tests/services/xxx.test.ts`（后端）／ `pnpm vitest run -c web/vitest.config.ts <file>`（前端）。

- 后端测试：`pnpm test`（Vitest，**node 环境**，`tests/`，镜像 `src/` 结构）
- 前端测试：`pnpm test:web`（Vitest，**jsdom**，`web/src/**/*.test.ts`，与组件同目录）
- 测试用内存 SQLite（`tests/helpers/testDb.ts` 的 `createTestDb`），无需外部服务
- CI（`.github/workflows/ci.yml`）比 `pnpm check` 多跑一步 `pnpm build`；改动构建配置后本地补跑一次 build

## 三、代码结构去哪找

- **路径别名**：后端 `@/*` → `src/*`（`tsconfig.json`）；前端 `@/*` → `web/src/*`（`web/tsconfig.json`）。两套独立。
- **只有两处是运行时相关的**：`src/db/client.ts`（驱动选择）与 `src/server/node.ts` / `worker.ts`（入口）。其余 schema / services / routes / middleware / 前端**全共享**。
- 后端分层：`routes/`（薄，调 service）→ `services/`（业务逻辑，只依赖 db 接口 + 注入的 `fetch`）→ `db/`（schema / client / tx / 迁移）；横切在 `middleware/`（auth / rateLimit）。`app.ts` 组装共享 Hono app。
- 前端分层：组件按 `atoms / molecules / tags / home / layout / manage`；`composables/` 副作用；`stores/` Pinia；`views/`（含 `settings/` 各分区）；`lib/` 纯逻辑；`api/` fetch 客户端。

## 四、文档地图（先读文档再动手）

- `docs/技术文档.md` — 架构、数据模型、安全、关键算法的**唯一权威**，标注「与代码对齐」。改了架构性内容后同步更新它。
- `docs/需求文档.md` — 功能需求、角色、首页布局、快捷键表。需求变化时同步。
- `README.md` — 部署与运维（Docker / Cloudflare），面向使用者。
- `DEPLOY_CLOUDFLARE.md` — Cloudflare 首次部署完整步骤。

## 五、架构铁律（违反会破坏双栈对等）

- **不引入单端 API**：services 只能依赖 Drizzle 的 db 接口 + 注入的 `fetch`。不得使用只在 Node 或只在 Workers 可用的 API。运行时差异只允许出现在 `client.ts` 和两个入口。
- **多表原子写必须走 `src/db/tx.ts` 的 `runWrite`**（Node 事务 / D1 batch），不要直接开事务——D1 不支持交互式事务。需要链式自增 id 的操作（建号 / 建网址 / 导入建层级）改为顺序 `await`。
- **不设 DB 外键**（schema 不写 `references()`）：级联删除、关联清理全部在 service 层手动处理。这是刻意决策，不要「补上」外键。
- **账号隔离**：所有用户数据查询必须按当前 `user_id` 过滤；越权与不存在**统一返回 `404 not_found`**。
- 模糊搜索用 **SQL LIKE**（`services/likeEscape.ts` 转义），刻意不用 FTS5。
- **五个 service 有模块级内存缓存**（sessions / users / prefs / engines / tags）：写后必须 invalidate 对应条目，删用户时级联失效其全部缓存。改这些 service 时别漏掉失效路径。
- **配额与请求体校验分处两地**：有状态配额（查库计数）在 `services/limits.ts` → `409 limit_exceeded`；无状态请求体形状校验在 `routes/schemas.ts` → `400`。两者不要混放；`limits.ts` 刻意不做成环境变量。

## 六、源码里的「禁改」护栏注释

源码中「刻意 / 注意 / 禁止」类注释都是护栏，改动前先读懂：

- `sloganMarkup.ts`（`src/services/` 与 `web/src/lib/` 各一份，逻辑必须一致）：长度计数**必须复用 `parseSlogan`**，禁止改成独立正则；未闭合 / 非法标记一律降级为字面文字，**绝不吞用户内容**。
- `services/ssrf.ts` 只拦显式 localhost 与 IP 字面量私网；**DNS 复核在 fetcher / node 入口**（对解析出的每个 IP 二次校验，防 rebinding）——不要以为 `ssrf.ts` 是完整防线。
- `routes/transfer.ts` 导入校验**刻意宽松**（不强校验 URL 格式），便于迁移恢复。
- `web/src/composables/useBackground.ts`：DB 存的是「背景可见度」，前端要**反相**为遮罩不透明度。
- `web/src/lib/audioCache.ts`：`resolveAudioUrl` 在播放热路径上**故意不入缓存队列**。

## 七、数据库与迁移

- schema 是唯一数据真相（`src/db/schema.ts`，7 表）。除 `sessions` 外每表都有 `audit` mixin（`created_date` / `last_modified_date`）。
- 改 schema → `pnpm db:generate` → 迁移 SQL 与 `meta/*_snapshot.json` **一并提交**。
- **绝不手改已应用过的迁移 SQL**；要调整就新增一条迁移。
- 迁移一份（`src/db/migrations/`），两端各自应用：Node 启动时 `migrate.ts` 自动跑，D1 用 `wrangler d1 migrations apply`。
- **数据回填/数据修正必须写成 SQL 迁移**（`pnpm exec drizzle-kit generate --custom --name=xxx` 生成空迁移后手写 SQL），禁止写在 `migrate.ts` 等代码里——代码只在 Node 侧执行，D1 侧会静默缺失，破坏双栈对等。

## 八、环境变量（实际可配项）

Node / Docker（`src/server/config.ts`、`node.ts`）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `DATABASE_FILE` | `./navi.sqlite` | SQLite 文件路径 |
| `PORT` | `8787` | 监听端口 |
| `SECURE_COOKIES` | 看 `NODE_ENV` | `true`/`false` 显式生效；未设时 `NODE_ENV=production` → true。HTTP 访问务必设 `false`，否则登录后 cookie 不下发 |
| `NODE_ENV` | — | 仅作 `SECURE_COOKIES` 的回退依据 |

Workers：`DB`（D1 绑定）、`ASSETS`（静态资源绑定），见 `wrangler.toml`。

## 九、代码约定

- 注释、文档、commit message 均用**中文**；commit 走 `feat:` / `fix:` / `perf:` / `docs:` / `chore:` / `style:` 前缀。
- Prettier：单引号、分号、宽度 100、`trailingComma: all`、tab 2 空格（`.prettierrc.json`）。`eslint.config.js` 已关 `no-undef`（TS 负责），未用变量以 `_` 前缀豁免。
- 前端组件一律 `<script setup>` + 类型式 `defineProps/defineEmits`。
- 新增功能同时补测试：后端放 `tests/`（镜像 src 结构），前端测试文件与组件同目录。
- 仓库根的 `navi.sqlite*` 是本地开发数据库，别提交、别当测试夹具（已在 `.gitignore`）。
- `.claude/` `.agents/` `.wrangler/` `dist/` 均已忽略，不进 Git、不进 Docker 构建上下文。

## 十、Git 红线（❗️绝对禁止）

**禁止对远程仓库做任何操作**——即使用户在某次对话里说了「可以推」，也仅限那一次明确授权的 `git push`，不扩展到其他远程操作。以下一律不做：

- `git push`（未经本次明确授权）、`git push --force` / `--force-with-lease`
- 删除 / 重命名远程分支（`git push --delete`、`git push origin :branch` 等）
- 改动 remote 配置（`git remote add/remove/set-url`、更换仓库地址）
- 任何会推送到远程或改变远程状态的操作（含 tag 推送、`gh` / `glab` 建 PR/MR）

本地操作（commit、分支、stash、本地 tag）不受此限。需要与远程交互时，**先明确询问用户**，得到针对该次操作的授权后再执行。
