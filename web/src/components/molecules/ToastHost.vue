<script setup lang="ts">
/**
 * ToastHost — 通知容器（docs/design-system/03 §Toast）。
 * 在 App 根挂载一次；从右下角滑入，自动消失。aria-live 通报屏幕阅读器。
 */
import { useToast } from '@/composables/useToast';

const { toasts, remove } = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="tt in toasts"
          :key="tt.id"
          class="toast ui-surface"
          :class="`toast-${tt.variant}`"
          @click="remove(tt.id)"
        >
          {{ tt.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  right: var(--spacing-6);
  bottom: var(--spacing-6);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  max-width: 22rem;
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  font-size: 0.875rem;
  border-left: 3px solid var(--color-border);
  cursor: pointer;
}

.toast-success {
  border-left-color: var(--color-success);
}
.toast-danger {
  border-left-color: var(--color-danger);
}
.toast-warning {
  border-left-color: var(--color-warning);
}
.toast-info {
  border-left-color: var(--color-info);
}

.toast-enter-active {
  transition:
    opacity var(--duration-base) var(--ease-out),
    transform var(--duration-base) var(--ease-out);
}
.toast-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-in),
    transform var(--duration-fast) var(--ease-in);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(100%);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
