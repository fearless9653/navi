// 将本项目的消息结构注入 vue-i18n，使 t('...') 的 key 参与类型检查：
// 拼错或引用不存在的 key 会被 vue-tsc 报错，而不再是运行时静默失效。
import type { MessageSchema } from './messages';

declare module 'vue-i18n' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface DefineLocaleMessage extends MessageSchema {}
}

// 强制本文件被视为模块（verbatimModuleSyntax 下 import type 会被擦除），
// 否则 declare module 会被当作全局脚本里的环境声明而报 TS2666。
export {};
