<div align="center">

# Navi

**极简个人导航页 — 搜索起始页 + 标签化书签管理**

一份代码，双栈部署：Docker 自托管，或基于 Cloudflare Workers + D1 **免费运行**

![License](https://img.shields.io/badge/license-MIT-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-%E8%87%AA%E6%89%98%E7%AE%A1-2496ED?logo=docker&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-%E5%8F%AF%E5%AE%89%E8%A3%85-5A0FC8)

</div>

![Navi 主页（浅色模式）](https://static.surfto.top/images/2026/08/03/homepage-bright.png)

## 为什么是 Navi

- **🆓 双栈对等部署** — 同一份代码，两条部署路径完全等价：有服务器则 `docker compose up -d` 自托管；没有服务器则部署到 Cloudflare Workers + D1，免费额度即可满足个人使用，无需购买和维护服务器。
- **🏷️ 层级标签，而非扁平分类** — 父标签自动聚合全部子集，多选标签取交集筛选，配合模糊搜索与多维排序。书签规模增长后，检索效率的差异会十分明显。
- **⌨️ 键盘优先** — `/` 直达网页搜索、`s` 站内搜索、`n` 新增网址、方向键浏览卡片，作为浏览器起始页可全程脱离鼠标操作（按 `?` 查看全部快捷键）。
- **🔐 完整的安全设计** — PBKDF2 密码哈希、CSRF 同源校验、SSRF 双层防护（含 DNS rebinding 复核）、登录限流、账号数据隔离，可放心部署在公网环境。

## 快速开始

**Docker（自托管）：**

```bash
git clone <your-repo-url> navi && cd navi
docker compose up -d        # → http://localhost:8787
```

**Cloudflare（Workers + D1）：**

```bash
pnpm install && pnpm build
pnpm exec wrangler deploy --env=""
```

首次访问会引导创建管理员账号。

> ⚠️ 部署在公网时，**启动后请立即完成首启向导**：在首个管理员创建之前，任何访问到该地址的人都可以把自己注册成管理员。

- Cloudflare 首次部署（创建并迁移 D1 等）完整步骤：[DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md)
- 数据持久化、环境变量、反向代理、备份恢复、升级、预构建镜像等运维细节：[部署运维手册](docs/部署运维.md)

## 特性一览

- **搜索首页**：居中网页搜索、可配多引擎切换，左下最近访问，右侧级联标签选择器
- **书签管理**：模糊搜索、多维排序分页卡片网格、批量删除 / 批量打标签、启用停用
- **抓取增强**：新增网址自动抓取 favicon / 标题 / 描述
- **导入导出**：完整 JSON 备份（merge / replace）+ Netscape HTML 浏览器书签互通，操作前当前密码二次确认
- **个性化**：自定义 / Bing 每日背景图（明暗独立透明度）、富文本个性签名、背景音乐播放器
- **多账号**：账号隔离、多管理员、首启向导
- **可安装应用**：Web App Manifest + 多尺寸图标，可安装到桌面或主屏幕
- **国际化**：中文 / 英文；黑暗模式（跟随系统 + 手动切换）

## 界面预览

| 深色模式 |
|---|
| ![深色模式](https://static.surfto.top/images/2026/08/03/homepage-dark.png) |

| 设置中心 |
|---|
| ![设置中心](https://static.surfto.top/images/2026/08/03/settings.png) |

<table>
  <tr>
    <th>移动端主页</th>
    <th>移动端设置</th>
  </tr>
  <tr>
    <td><img src="https://static.surfto.top/images/2026/08/03/mobile-homepage.png" alt="移动端主页" width="360"></td>
    <td><img src="https://static.surfto.top/images/2026/08/03/mobile-settings.png" alt="移动端设置" width="360"></td>
  </tr>
</table>

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
pnpm check          # 提交前门禁：typecheck + lint + 全部测试（CI 同款）
pnpm build          # Cloudflare / 通用前端构建到 dist/client
pnpm build:server   # 打包后端 Node 产物到 dist/server
pnpm build:docker   # Docker 构建：前端 + 后端
pnpm test           # 后端单元 + 集成测试（Vitest）
pnpm test:web       # 前端组件测试（Vitest + jsdom）
pnpm lint           # ESLint
pnpm format         # Prettier 格式化
pnpm db:generate    # 生成 Drizzle 迁移
```

### 架构速览

- **后端**：Hono + Drizzle ORM（SQLite 方言，数据层全异步，兼容 better-sqlite3 与 D1）
- **前端**：Vue 3 + Vite + Vue Router + Pinia + vue-i18n + Tailwind（具体版本以 `package.json` 为准）
- **数据库**：better-sqlite3（Node）/ D1（Workers）；7 表，无 DB 外键（service 层手动管理）

详尽的数据模型、API 与关键算法见 [技术文档](docs/技术文档.md)。

## 文档

- [部署运维手册](docs/部署运维.md) — Docker / Cloudflare 部署、备份恢复、升级
- [需求文档](docs/需求文档.md) — 功能需求、角色、首页布局
- [技术文档](docs/技术文档.md) — 技术栈、数据模型、API、架构

## 许可

[MIT](LICENSE)

## 鸣谢

由 [Claude Code](https://claude.ai/code) 协同开发。
