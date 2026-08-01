<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{ src: string | null; size?: string }>(), {
  size: 'h-5 w-5',
});

// 加载失败（含跨域 hotlink 拦截 / 404 / 非图片）时回退占位块。
const failed = ref(false);
watch(
  () => props.src,
  () => {
    failed.value = false;
  },
);
</script>

<template>
  <img
    v-if="src && !failed"
    :src="src"
    alt=""
    referrerpolicy="no-referrer"
    loading="lazy"
    class="shrink-0 rounded"
    :class="size"
    @error="failed = true"
  />
  <span v-else class="ui-fill-muted shrink-0 rounded" :class="size" />
</template>
