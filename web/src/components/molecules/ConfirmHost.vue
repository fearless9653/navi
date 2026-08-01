<script setup lang="ts">
/**
 * ConfirmHost — 全局确认对话框容器。在 App 根挂载一次，由 useConfirm 驱动。
 * 复用 BaseModal（继承焦点陷阱、Esc 关闭、进入动画），把删除等操作的二次确认
 * 统一成项目风格，替换浏览器原生 confirm()。
 */
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { useConfirm } from '@/composables/useConfirm';

const { t } = useI18n();
const { current, accept, cancel } = useConfirm();
</script>

<template>
  <BaseModal
    v-if="current"
    :key="current.id"
    :title="current.title ?? t('common.confirm')"
    :submit-label="current.confirmLabel ?? t('common.confirm')"
    :submit-variant="current.variant"
    @submit="accept"
    @close="cancel"
  >
    <p class="text-sm ui-text-subtle">{{ current.message }}</p>
  </BaseModal>
</template>
