<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useTheme } from '@/composables/useTheme';
import { BaseButton } from '@/components/atoms';

const { t } = useI18n();
const { theme, cycleTheme } = useTheme();
</script>

<template>
  <BaseButton
    variant="ghost"
    size="sm"
    icon-only
    :title="t('theme.' + theme)"
    :aria-label="t('theme.' + theme)"
    @click="cycleTheme"
  >
    <!-- 扁平线性图标（非拟物）：浅色=太阳 / 深色=月亮 / 跟随系统=显示器 -->
    <svg
      v-if="theme === 'light'"
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
      />
    </svg>
    <svg
      v-else-if="theme === 'dark'"
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
    <svg
      v-else
      class="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  </BaseButton>
</template>
