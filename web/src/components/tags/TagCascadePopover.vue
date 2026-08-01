<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import TagCascadePicker from './TagCascadePicker.vue';
import { BaseChevron } from '@/components/atoms';

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
const panelStyle = ref<Record<string, string>>({});

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
  if (spaceBelow < 240 && spaceAbove > spaceBelow) {
    panelStyle.value = {
      position: 'fixed',
      zIndex: 'var(--z-popover)',
      bottom: `${vh - r.top + 6}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${spaceAbove}px`,
    };
  } else {
    panelStyle.value = {
      position: 'fixed',
      zIndex: 'var(--z-popover)',
      top: `${r.bottom + 6}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.max(200, spaceBelow)}px`,
    };
  }
}

function toggle(): void {
  if (open.value) {
    open.value = false;
  } else {
    computePosition();
    open.value = true;
  }
}
function onWinChange(): void {
  if (open.value) open.value = false;
}
function onKeydown(e: KeyboardEvent): void {
  if (!open.value || e.key !== 'Escape') return;
  open.value = false;
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
      <div
        v-if="open"
        class="fixed inset-0"
        :style="{ zIndex: 'var(--z-overlay)' }"
        @click="open = false"
      />
      <!-- 浮层弹出/收起动效（pop 过渡见 style.css）；遮罩瞬显不参与过渡。 -->
      <Transition name="pop">
        <div
          v-if="open"
          class="overflow-y-auto rounded-xl p-3 shadow-xl ui-surface"
          :style="panelStyle"
        >
          <TagCascadePicker v-model="selected" :searchable="props.searchable" />
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
