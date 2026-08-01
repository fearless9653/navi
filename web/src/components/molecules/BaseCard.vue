<script setup lang="ts">
/**
 * BaseCard — 卡片容器（docs/design-system/07 §Card、03 §卡片微交互）。
 * header/body/footer 插槽；hoverable 时描边染 accent + 阴影抬升（无位移/缩放）。
 * interactive 渲染为 <button>（整卡可点击，键盘可达）。
 * flush 时由调用方完全掌控内部布局（仅渲染默认插槽，无内边距）。
 * translucent 时使用半透明毛玻璃表面（ui-surface-translucent），与最近访问栏一致。
 */
withDefaults(
  defineProps<{
    hoverable?: boolean;
    interactive?: boolean;
    flush?: boolean;
    translucent?: boolean;
  }>(),
  {
    hoverable: false,
    interactive: false,
    flush: false,
    translucent: false,
  },
);
const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <component
    :is="interactive ? 'button' : 'div'"
    class="card"
    :class="[
      translucent ? 'ui-surface-translucent' : 'ui-surface',
      { 'card-hoverable': hoverable || interactive, 'card-interactive': interactive },
    ]"
    :type="interactive ? 'button' : undefined"
    @click="emit('click', $event)"
  >
    <template v-if="flush"><slot /></template>
    <template v-else>
      <div v-if="$slots.header" class="card-header"><slot name="header" /></div>
      <div v-if="$slots.default" class="card-body"><slot /></div>
      <div v-if="$slots.footer" class="card-footer"><slot name="footer" /></div>
    </template>
  </component>
</template>

<style scoped>
.card {
  position: relative;
  isolation: isolate; /* 层叠上下文：让 glare 伪元素的 z-index:-1 落在「玻璃背景之上、内容之下」 */
  border-radius: var(--radius-md);
  /* 与悬浮阴影结构对齐：占位的透明辉光层 → accent 辉光，避免层数不一致导致过渡闪烁 */
  box-shadow:
    0 10px 30px -12px transparent,
    var(--shadow-xs);
  transition:
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}

/* 悬浮高光(C)：斜向掠过玻璃面的光带。z-index:-1 + isolation 让它叠在卡片背景之上、内容之下，
   border-radius:inherit 随圆角裁剪，pointer-events:none 避免拦截卡片点击。 */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  z-index: -1;
  background-image: var(--card-glare);
  opacity: 0;
  transition: opacity var(--duration-base) var(--ease-out);
}

.card-interactive {
  display: block;
  width: 100%;
  text-align: left;
  cursor: pointer;
}

.card-hoverable:hover {
  border-color: color-mix(in srgb, var(--color-accent) 40%, var(--color-border));
  box-shadow: var(--shadow-card-hover);
  /* 仅描边染 accent + 阴影抬升作为层级提示，不做位移/缩放（避免悬浮时整卡上浮）。 */
  transition:
    border-color var(--duration-base) var(--ease-out),
    box-shadow var(--duration-base) var(--ease-out);
}

.card-hoverable:hover::before {
  opacity: 1;
}

.card-interactive:active {
  transform: scale(0.99);
  transition-duration: var(--duration-fast);
}

.card-interactive:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.card-header {
  padding: var(--spacing-4);
}

.card-body {
  padding: var(--spacing-4);
}

.card-footer {
  padding: var(--spacing-3) var(--spacing-4);
  border-top: 1px solid var(--color-divider);
}

@media (prefers-reduced-motion: reduce) {
  .card-hoverable:hover,
  .card-interactive:active {
    transform: none;
  }
}
</style>
