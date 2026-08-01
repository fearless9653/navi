# ---- build：安装全部依赖并构建前端静态资源 + 后端 bundle ----
FROM node:22-slim AS build
WORKDIR /app
# corepack 会读取 package.json 的 packageManager 字段自动使用钉定的 pnpm 版本（版本单一来源，勿在此重复钉版本）
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build:docker

# ---- runtime：构建产物 + bundle 唯一的外部依赖 better-sqlite3 ----
FROM node:22-slim AS runtime
WORKDIR /app
# sqlite3 CLI：README「数据备份与恢复」的在线热备命令依赖它
RUN apt-get update \
  && apt-get install -y --no-install-recommends sqlite3 \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    SECURE_COOKIES=false \
    PORT=8787 \
    DATABASE_FILE=/data/navi.sqlite
# 后端 bundle 已内联全部 JS 依赖，唯一外部依赖是原生模块 better-sqlite3（精确版本见 package.runtime.json）；
# 用 node 自带的 npm 安装，runtime 层无需 pnpm/corepack
COPY docker/package.runtime.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data && chown node:node /data
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT||8787}/api/health`).then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# entrypoint 以 root 进入：先把 /data 交给 node 用户，再降权运行预编译的 Node 服务
# （bind mount 目录首次由 Docker 以 root 创建，直接 USER node 会因无写权限启动失败）
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "dist/server/node.js"]
