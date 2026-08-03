# CLAUDE.md

> 全 AI 助手通用的操作手册在 `AGENTS.md`（项目介绍、命令、架构铁律、迁移规范、Git 红线等），通过下方引入生效，**必须完整遵守**。
> 本文件只维护 **Claude Code 专属**的补充规则；新增通用规则请写进 `AGENTS.md`，不要写在这里。

@[AGENTS.md](./AGENTS.md)

## Claude Code 专属注意事项

- `.claude/settings.local.json` 里历史可能遗留了 `npm run *` 的放行项，**别当成许可**——包管理器仍然只用 pnpm（规则见 AGENTS.md「二、命令」）。
