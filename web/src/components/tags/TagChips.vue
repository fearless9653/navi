<script setup lang="ts">
import type { Tag } from '@/api/types';
import { BaseBadge } from '@/components/atoms';

defineProps<{ tags: Tag[] }>();
const emit = defineEmits<{ remove: [id: number] }>();
</script>

<template>
  <!-- 已选标签增删：TransitionGroup 让 chip 弹入弹出（scale + 淡入），move 让相邻 chip 平滑补位。
       动效类见 <style>，用 transition 故自动受全局 reduced-motion 压制。 -->
  <TransitionGroup v-if="tags.length" tag="div" name="chip" class="flex flex-wrap gap-1">
    <BaseBadge v-for="tg in tags" :key="tg.id" variant="primary" class="gap-1">
      {{ tg.path }}
      <button type="button" class="chip-remove" @click="emit('remove', tg.id)">×</button>
    </BaseBadge>
  </TransitionGroup>
</template>

<style scoped>
.chip-remove {
  transition: color var(--duration-fast) var(--ease-out);
}
.chip-remove:hover {
  color: var(--color-danger);
}

/* chip 进出：ease-back 让进场带轻微回弹（弹入手感），离场用 ease-in 快收。 */
.chip-enter-active {
  transition:
    opacity var(--duration-fast) var(--ease-out),
    transform var(--duration-base) var(--ease-back);
}
.chip-leave-active {
  transition:
    opacity var(--duration-fast) var(--ease-in),
    transform var(--duration-fast) var(--ease-in);
  /* 离场脱离文档流，避免占位导致相邻 chip 补位时闪跳（配合 chip-move 平滑左移）。 */
  position: absolute;
}
.chip-enter-from,
.chip-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
/* 相邻 chip 因增删而位移时平滑滑动补位（FLIP）。 */
.chip-move {
  transition: transform var(--duration-base) var(--ease-out);
}
</style>
