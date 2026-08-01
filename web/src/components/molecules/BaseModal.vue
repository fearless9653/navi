<script setup lang="ts">
/**
 * BaseModal — 模态框（docs/design-system/07 §Modal、03 §模态框微交互、06 §模态框无障碍）。
 * 契约与旧 ui/Modal.vue 保持一致：props { title, busy, wide }，emits { close, submit }。
 * 增强：role=dialog / aria-modal、焦点移入与恢复、Tab 焦点陷阱、Esc 关闭、
 * 进入动画（遮罩淡入 + 内容缩放）、z-index 令牌、Teleport 到 body 避免裁剪。
 */
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseButton } from '@/components/atoms';

defineProps<{
  title: string;
  busy?: boolean;
  wide?: boolean;
  hideFooter?: boolean;
  submitLabel?: string;
  submitVariant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}>();
const emit = defineEmits<{ close: []; submit: [] }>();
const { t } = useI18n();

const titleId = useId();
const dialogRef = ref<HTMLElement>();
let previouslyFocused: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  if (!dialogRef.value) return [];
  return Array.from(
    dialogRef.value.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute('disabled'));
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
    return;
  }
  if (e.key !== 'Tab') return;
  const items = focusables();
  if (items.length === 0) return;
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement as HTMLElement | null;
  // 焦点移入：首个可聚焦元素，否则对话框本身。
  const items = focusables();
  (items[0] ?? dialogRef.value)?.focus();
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  previouslyFocused?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <Transition appear name="modal">
      <div class="modal-overlay ui-overlay" @click.self="emit('close')">
        <form
          ref="dialogRef"
          class="modal-panel ui-surface"
          :class="wide ? 'modal-wide' : 'modal-default'"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
          @submit.prevent="emit('submit')"
        >
          <h2 :id="titleId" class="modal-title">{{ title }}</h2>
          <div class="modal-body">
            <slot />
          </div>
          <div v-if="!hideFooter" class="modal-footer">
            <BaseButton variant="ghost" size="sm" @click="emit('close')">
              {{ t('common.cancel') }}
            </BaseButton>
            <BaseButton
              type="submit"
              size="sm"
              :variant="submitVariant ?? 'primary'"
              :loading="busy"
            >
              {{ submitLabel ?? t('common.save') }}
            </BaseButton>
          </div>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  padding: var(--spacing-4);
  -webkit-backdrop-filter: blur(4px) saturate(140%);
  backdrop-filter: blur(4px) saturate(140%);
}

.modal-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--spacing-5);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
}

.modal-default {
  max-width: 32rem;
}

.modal-wide {
  max-width: 42rem;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
  padding-top: var(--spacing-2);
}

/* 进入/离开动画（doc 03） */
.modal-enter-active {
  transition: opacity var(--duration-base) var(--ease-out);
}
.modal-leave-active {
  transition: opacity var(--duration-fast) var(--ease-in);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .modal-panel {
  transition: transform var(--duration-medium) var(--ease-bounce);
}
.modal-enter-from .modal-panel {
  transform: scale(0.95) translateY(-12px);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-panel {
    transition: none;
  }
  .modal-enter-from .modal-panel {
    transform: none;
  }
}
</style>
