<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TagCascadePicker from './TagCascadePicker.vue';
import { BaseChevron } from '@/components/atoms';
import { useBackdropDismiss } from '@/composables/useBackdropDismiss';

const props = withDefaults(
  defineProps<{
    label?: string;
    searchable?: boolean;
  }>(),
  {
    label: undefined,
    searchable: true,
  },
);
const selected = defineModel<number[]>({ default: () => [] });

const { t } = useI18n();
const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

const PREFERRED_HEIGHT = 320;
const MIN_HEIGHT = 160;

/** 按触发按钮位置计算浮层的 fixed 坐标；空间不足时向上翻转。 */
function computePosition(): void {
  const el = triggerRef.value;
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(vw - 16, 640);
  const left = Math.min(Math.max(8, r.left), vw - width - 8);
  const spaceBelow = vh - r.bottom - 12;
  const spaceAbove = r.top - 12;
  const placeAbove = spaceBelow < 240 && spaceAbove > spaceBelow;
  const available = placeAbove ? spaceAbove : spaceBelow;
  // 给面板明确高度（不只是 max-height），内部 flex 列表才能出现滚动，而不是撑出外框滚动条。
  const height = Math.max(Math.min(available, PREFERRED_HEIGHT), Math.min(available, MIN_HEIGHT));
  const base: Record<string, string> = {
    position: 'fixed',
    zIndex: 'var(--z-popover)',
    left: `${left}px`,
    width: `${width}px`,
    height: `${height}px`,
  };
  if (placeAbove) {
    panelStyle.value = {
      ...base,
      bottom: `${vh - r.top + 6}px`,
    };
  } else {
    panelStyle.value = {
      ...base,
      top: `${r.bottom + 6}px`,
    };
  }
}

function close(): void {
  open.value = false;
}
const { onBackdropPointerDown, onBackdropPointerUp } = useBackdropDismiss(close);

function toggle(): void {
  if (open.value) {
    close();
  } else {
    computePosition();
    open.value = true;
  }
}
function onWinChange(e?: Event): void {
  if (!open.value) return;
  // 浮层内部滚动（标签多到出现滚动条时）不应关闭弹层；仅外部滚动/缩放才关闭。
  if (e?.type === 'scroll' && e.target instanceof Node && panelRef.value?.contains(e.target)) {
    return;
  }
  close();
}
function onKeydown(e: KeyboardEvent): void {
  if (!open.value || e.key !== 'Escape') return;
  close();
  // capture 阶段先于外层（如 BaseModal 的 document keydown）执行，阻止 Esc 连带关闭整个弹窗/表单。
  e.stopImmediatePropagation();
  e.preventDefault();
}

onMounted(() => {
  window.addEventListener('resize', onWinChange);
  window.addEventListener('scroll', onWinChange, true);
  window.addEventListener('keydown', onKeydown, true);
});
onUnmounted(() => {
  window.removeEventListener('resize', onWinChange);
  window.removeEventListener('scroll', onWinChange, true);
  window.removeEventListener('keydown', onKeydown, true);
});
</script>

<template>
  <div class="inline-block">
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ui-button-secondary"
      @click="toggle"
    >
      <span>{{ props.label ?? t('home.filterByTag') }}</span>
      <span
        v-if="selected.length"
        class="rounded-full px-1.5 text-xs text-[var(--color-on-accent)]"
        :style="{ backgroundColor: 'var(--color-accent)' }"
        >{{ selected.length }}</span
      >
      <BaseChevron :open="open" class="opacity-60" />
    </button>

    <!-- 传送到 body：脱离 overflow 上下文，真正浮在最上层、不影响布局高度。已选标签由外层常驻一行展示。 -->
    <Teleport to="body">
      <!-- 遮罩与面板同为 --z-popover（高于 --z-modal），后画的面板叠在遮罩之上；
           这样点弹窗空白会先关掉标签浮层，而不是被 modal 挡住导致只能再点一次按钮。 -->
      <div
        v-if="open"
        data-test="tag-popover-overlay"
        class="fixed inset-0"
        :style="{ zIndex: 'var(--z-popover)' }"
        @pointerdown="onBackdropPointerDown"
        @pointerup="onBackdropPointerUp"
      />
      <!-- 浮层弹出/收起动效（pop 过渡见 style.css）；遮罩瞬显不参与过渡。 -->
      <Transition name="pop">
        <div
          v-if="open"
          ref="panelRef"
          data-test="tag-popover-panel"
          class="tag-popover-panel flex flex-col overflow-hidden rounded-xl p-3 shadow-xl ui-surface"
          :style="panelStyle"
        >
          <TagCascadePicker v-model="selected" :searchable="props.searchable" fill />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.tag-popover-panel {
  overscroll-behavior: contain;
}
</style>
