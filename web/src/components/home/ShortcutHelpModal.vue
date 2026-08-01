<script setup lang="ts">
/**
 * ShortcutHelpModal — 键盘快捷键帮助面板（? 打开）。
 * 展示首页可用快捷键；修饰键按平台显示 ⌘ / Ctrl。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';

defineProps<{ authed: boolean }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();

// 平台探测仅用于展示文案（⌘K vs Ctrl K），实际监听两者都接受。
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');
const ctrlKey = computed(() => (isMac ? '⌘' : 'Ctrl'));

interface Row {
  labelKey: string;
  keys: string[][]; // 外层：多组等效键位（以「或」相连）；内层：单组内的组合键
  authedOnly?: boolean;
}
const rows: Row[] = [
  { labelKey: 'shortcuts.focusWebSearch', keys: [['/'], [ctrlKey.value, 'K']] },
  { labelKey: 'shortcuts.focusBookmarkSearch', keys: [['S']], authedOnly: true },
  { labelKey: 'shortcuts.focusFirstBookmark', keys: [['G']], authedOnly: true },
  { labelKey: 'shortcuts.moveBetweenBookmarks', keys: [['↑', '↓', '←', '→']], authedOnly: true },
  { labelKey: 'shortcuts.newBookmark', keys: [['N']], authedOnly: true },
  { labelKey: 'shortcuts.togglePlay', keys: [['P']], authedOnly: true },
  { labelKey: 'shortcuts.clearAndBlur', keys: [['Esc']] },
  { labelKey: 'shortcuts.openHelp', keys: [['?']] },
];
</script>

<template>
  <BaseModal
    :title="t('shortcuts.title')"
    hide-footer
    @close="emit('close')"
    @submit="emit('close')"
  >
    <ul class="flex flex-col">
      <template v-for="row in rows" :key="row.labelKey">
        <li
          v-if="!row.authedOnly || authed"
          class="flex items-center justify-between gap-4 border-b py-2 ui-divider last:border-b-0"
        >
          <span class="text-sm ui-text">{{ t(row.labelKey) }}</span>
          <span class="flex shrink-0 items-center gap-1.5">
            <template v-for="(combo, i) in row.keys" :key="i">
              <span v-if="i > 0" class="text-xs ui-text-faint">{{ t('shortcuts.or') }}</span>
              <span class="flex items-center gap-0.5">
                <kbd v-for="k in combo" :key="k" class="ui-kbd">{{ k }}</kbd>
              </span>
            </template>
          </span>
        </li>
      </template>
    </ul>
  </BaseModal>
</template>
