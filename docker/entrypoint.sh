#!/bin/sh
# 以 root 启动时：把数据目录所有权交给 node 用户后降权运行，避免服务进程长期以 root 身份跑。
# 若容器被显式以非 root 用户启动（docker run --user），则直接原样执行。
set -e
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data
  exec setpriv --reuid node --regid node --init-groups "$@"
fi
exec "$@"
