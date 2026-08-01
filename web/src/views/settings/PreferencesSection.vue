<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePrefsStore } from '@/stores/prefs';
import { BaseSelect } from '@/components/atoms';
import type { SortKey } from '@/api/types';

const { t } = useI18n();
const prefs = usePrefsStore();

const defaultSort = ref<SortKey>('created');
const savedField = ref(false);

const sorts: SortKey[] = ['weight', 'name', 'recent', 'created', 'visits'];
const sortOptions = computed<{ value: SortKey; label: string }[]>(() =>
  sorts.map((s) => ({ value: s, label: t('sort.' + s) })),
);

// 每项独立保存：仅提交改动的那一项。切换即保存（change 由 BaseSelect 选定时派发）。
async function save(): Promise<void> {
  await prefs.update({ defaultSort: defaultSort.value });
  savedField.value = true;
  setTimeout(() => {
    savedField.value = false;
  }, 1500);
}

onMounted(async () => {
  await prefs.load();
  if (prefs.prefs) {
    defaultSort.value = (
      sorts.includes(prefs.prefs.defaultSort as SortKey) ? prefs.prefs.defaultSort : 'created'
    ) as SortKey;
  }
});
</script>

<template>
  <div
    data-test="preferences-surface"
    class="max-w-xl space-y-4 rounded-lg p-4 ui-surface-translucent shadow-sm sm:p-5"
  >
    <!-- 网址列表 -->
    <section class="space-y-4">
      <h2 class="ui-section-title">
        {{ t('settings.listSection') }}
      </h2>
      <div class="space-y-1">
        <label class="flex items-center justify-between text-sm font-medium">
          <span class="flex items-center gap-2">
            {{ t('settings.defaultSort') }}
            <span v-if="savedField" class="text-xs ui-status-success">✓</span>
          </span>
          <BaseSelect v-model="defaultSort" size="sm" :options="sortOptions" @change="save" />
        </label>
        <p class="text-xs ui-text-faint">{{ t('settings.defaultSortDesc') }}</p>
      </div>
    </section>
  </div>
</template>
