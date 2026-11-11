<script setup lang="ts">
/**
 * BaseDropdown — 浮层下拉（抽取 EngineSelector / AccountMenu / 列设置等重复模式）。
 * 自管 open 状态；点击外部遮罩或 Esc 关闭；aria-expanded；z-index 令牌。
 * 用法：
 *   <BaseDropdown align="right">
 *     <template #trigger="{ toggle, open }"> <button @click="toggle">…</button> </template>
 *     <template #default="{ close }"> …菜单项，点选后 close() … </template>
 *   </BaseDropdown>
 */
import { onBeforeUnmount, onMounted, onUnmounted, ref, watch } from 'vue';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss';

const props = withDefaults(
  defineProps<{ align?: 'left' | 'right'; matchTriggerWidth?: boolean }>(),
  { align: 'left', matchTriggerWidth: false },
);

// open/close 事件供包装组件（BaseListbox）在展开/收起时做副作用（初始化高亮项、清 typeahead）。
const emit = defineEmits<{ open: []; close: [] }>();

const open = ref(false);
const wrapperRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

/**
 * 按触发按钮位置计算浮层的 fixed 坐标。
 * 用 Teleport + fixed 脱离触发处的层叠上下文（如毛玻璃 backdrop-filter 容器），
 * 否则 z-index 会被限制在该上下文内，被页面其它内容遮挡。
 */
function computePosition(): void {
  const el = wrapperRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const style: Record<string, string> = {
    position: 'fixed',
    top: `${r.bottom + 4}px`,
    zIndex: 'calc(var(--z-dropdown) + 1)',
  };
  if (props.align === 'right') {
    style.right = `${window.innerWidth - r.right}px`;
  } else {
    style.left = `${r.left}px`;
  }
  // matchTriggerWidth：菜单宽度对齐触发器（表单场景，BaseSelect 用），
  // 但仍受窗口宽度兜底，避免窄屏溢出视口。
  if (props.matchTriggerWidth) {
    style.minWidth = `${r.width}px`;
    style.maxWidth = `calc(100vw - ${r.left}px - 8px)`;
  }
  menuStyle.value = style;
}

function open_(): void {
  if (open.value) return;
  computePosition();
  open.value = true;
}
function toggle(): void {
  if (open.value) {
    open.value = false;
  } else {
    open_();
  }
}
function close(): void {
  open.value = false;
}
const { onBackdropPointerDown, onBackdropPointerUp } = useBackdropDismiss(close);

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') close();
}
function onWinChange(e?: Event): void {
  if (!open.value) return;
  // 浮层内部滚动（引擎列表等）不应关闭下拉；仅外部滚动/缩放才关闭。
  if (e?.type === 'scroll' && e.target instanceof Node && menuRef.value?.contains(e.target)) {
    return;
  }
  open.value = false;
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', onKeydown);
    emit('open');
  } else {
    document.removeEventListener('keydown', onKeydown);
    emit('close');
  }
});

// 暴露给包装组件（BaseListbox）：编程式开合 + 浮层节点引用（键盘导航时滚动高亮项进视口）。
defineExpose({
  open: open_,
  close,
  toggle,
  isOpen: () => open.value,
  menuEl: () => menuRef.value,
});

onMounted(() => {
  window.addEventListener('resize', onWinChange);
  window.addEventListener('scroll', onWinChange, true);
});
onUnmounted(() => {
  window.removeEventListener('resize', onWinChange);
  window.removeEventListener('scroll', onWinChange, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div ref="wrapperRef" class="dropdown">
    <slot name="trigger" :toggle="toggle" :open="open" :close="close" />
    <!-- 传送到 body：脱离触发处的层叠上下文（毛玻璃容器等），令 z-index 相对页面根生效。 -->
    <Teleport to="body">
      <div v-if="open" class="dropdown-scrim" data-test="dropdown-scrim" @pointerdown="onBackdropPointerDown" @pointerup="onBackdropPointerUp" />
      <!-- 浮层弹出/收起动效（pop 过渡见 style.css，enter/leave 对称）；遮罩瞬显不参与过渡。 -->
      <Transition name="pop">
        <div v-if="open" ref="menuRef" class="dropdown-menu ui-surface" :style="menuStyle">
          <slot :close="close" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dropdown {
  position: relative;
}

.dropdown-scrim {
  position: fixed;
  inset: 0;
  z-index: var(--z-dropdown);
}

.dropdown-menu {
  /* 定位坐标由内联 menuStyle 提供（position:fixed + top/left/right + z-index）。
     进出动效改由模板的 <Transition name="pop"> 提供（enter/leave 对称，见 style.css），
     不再用 animation——那只有进场、且会与过渡类叠加冲突。 */
  overflow: hidden;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}
</style>
