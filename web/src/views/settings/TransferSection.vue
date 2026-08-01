<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, ApiException } from '@/api/client';
import { BaseButton, BaseRadio } from '@/components/atoms';
import { PasswordConfirmModal } from '@/components/molecules';
import { asLimitError } from '@/lib/limitError';
import {
  looksLikeNetscapeHtml,
  parseNetscapeHtml,
  serializeNetscapeHtml,
  type ExportBookmark,
} from '@/lib/browserBookmarks';

const { t } = useI18n();
const fileInput = ref<HTMLInputElement | null>(null);
const fileName = ref('');
const fileData = ref<unknown>(null);
/** 按内容识别的格式：json=私有备份，html=浏览器书签，null=未选择/无法识别。 */
const fileFormat = ref<'json' | 'html' | null>(null);
const htmlStats = ref<{ bookmarks: number; folders: number } | null>(null);
const importMode = ref<'merge' | 'replace'>('merge');
const importResult = ref('');
const importing = ref(false);
// 选择文件的加载令牌：快速连选时只让最后一次的解析结果生效。
let fileLoadToken = 0;

// 导出/导入均为敏感操作，执行前弹窗要求当前密码二次确认（后端强制校验）。
// pendingAction 记录待执行的操作，密码校验通过后再真正触发。
type PendingAction = 'json' | 'html' | 'import';
const pendingAction = ref<PendingAction | null>(null);
const confirmBusy = ref(false);
const confirmError = ref('');
const confirmTitle = computed(() => {
  switch (pendingAction.value) {
    case 'json':
      return t('settings.exportJson');
    case 'html':
      return t('settings.exportHtml');
    case 'import':
      return t('settings.import');
    default:
      return '';
  }
});

function download(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportJson(password: string): Promise<void> {
  const data = await api.post<unknown>('/export', { password });
  download(JSON.stringify(data, null, 2), 'navi-export.json', 'application/json');
}

async function exportHtml(password: string): Promise<void> {
  const data = await api.post<{ bookmarks: ExportBookmark[] }>('/export', { password });
  download(serializeNetscapeHtml(data.bookmarks), 'navi-bookmarks.html', 'text/html');
}

function pickFile(): void {
  fileInput.value?.click();
}
async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  // 立即重置输入值：否则再次选择同一文件不会触发 change（浏览器对相同选择去重）。
  input.value = '';
  importResult.value = '';
  fileData.value = null;
  fileFormat.value = null;
  htmlStats.value = null;
  if (!file) {
    fileName.value = '';
    return;
  }
  fileName.value = file.name;
  const token = ++fileLoadToken;
  const text = await file.text();
  // 快速连选 A→B 时只让最后一次生效，丢弃过期结果。
  if (token !== fileLoadToken) return;

  // 按内容识别格式（后缀不等价格式）：先试 JSON，再试浏览器书签 HTML。
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      fileData.value = parsed;
      fileFormat.value = 'json';
      return;
    }
  } catch {
    /* 不是 JSON，继续尝试 HTML */
  }
  if (looksLikeNetscapeHtml(text)) {
    const r = parseNetscapeHtml(text);
    if (r.bookmarkCount > 0) {
      fileData.value = r.data;
      fileFormat.value = 'html';
      htmlStats.value = { bookmarks: r.bookmarkCount, folders: r.folderCount };
      return;
    }
  }
  importResult.value = t('settings.unrecognizedFile');
}
// 仅负责发起导入并写入成功结果；错误（含密码错误）向上抛给 onConfirm 统一处理，
// 使导入与导出的错误提示一致（都留在弹窗内），不再吞进 importResult。
async function runImport(password: string): Promise<void> {
  if (fileData.value === null) return;
  importing.value = true;
  importResult.value = '';
  try {
    const r = await api.post<{
      tagsCreated: number;
      bookmarksCreated: number;
      bookmarksSkipped: number;
    }>('/import', { password, mode: importMode.value, data: fileData.value });
    importResult.value = `+${r.bookmarksCreated} / skip ${r.bookmarksSkipped}`;
  } finally {
    importing.value = false;
  }
}

/** 打开密码确认弹窗；记录待执行操作。 */
function requestExportJson(): void {
  pendingAction.value = 'json';
}
function requestExportHtml(): void {
  pendingAction.value = 'html';
}
function requestImport(): void {
  if (fileData.value === null) return;
  pendingAction.value = 'import';
}

function closeConfirm(): void {
  pendingAction.value = null;
  confirmError.value = '';
  confirmBusy.value = false;
}

/**
 * 弹窗提交：先做密码校验（导出/导入的后端接口都会校验密码），
 * 校验通过后执行对应操作并关闭弹窗；密码错误则留在弹窗内提示。
 */
async function onConfirm(password: string): Promise<void> {
  const action = pendingAction.value;
  if (!action) return;
  confirmBusy.value = true;
  confirmError.value = '';
  try {
    if (action === 'json') await exportJson(password);
    else if (action === 'html') await exportHtml(password);
    else await runImport(password);
    closeConfirm();
  } catch (e) {
    // 后端密码错误返回 400 wrong_password：留在弹窗内提示，其余错误也归一提示。
    if (e instanceof ApiException && (e.body as { error?: string })?.error === 'wrong_password') {
      confirmError.value = t('auth.wrongPassword');
    } else {
      confirmError.value = t('settings.transferFailed');
    }
    confirmBusy.value = false;
  }
}
</script>

<template>
  <div
    data-test="transfer-surface"
    class="max-w-xl space-y-8 rounded-lg p-4 ui-surface-translucent shadow-sm sm:p-5"
  >
    <!-- 导出 -->
    <section class="space-y-2">
      <h2 class="ui-section-title">
        {{ t('settings.export') }}
      </h2>
      <div class="flex items-center gap-3 text-sm">
        <BaseButton
          data-test="export-json"
          variant="secondary"
          size="sm"
          class="w-32 shrink-0"
          @click="requestExportJson"
        >
          {{ t('settings.exportJson') }}
        </BaseButton>
        <span class="ui-text-subtle">{{ t('settings.exportJsonDesc') }}</span>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <BaseButton
          data-test="export-html"
          variant="secondary"
          size="sm"
          class="w-32 shrink-0"
          @click="requestExportHtml"
        >
          {{ t('settings.exportHtml') }}
        </BaseButton>
        <span class="ui-text-subtle">{{ t('settings.exportHtmlDesc') }}</span>
      </div>
    </section>

    <!-- 导入 -->
    <section class="space-y-3">
      <h2 class="ui-section-title">
        {{ t('settings.import') }}
      </h2>
      <p class="text-sm ui-text-subtle">{{ t('settings.importDesc') }}</p>

      <div class="flex items-center gap-3 text-sm">
        <BaseButton variant="secondary" size="sm" @click="pickFile">
          {{ t('settings.chooseFile') }}
        </BaseButton>
        <span class="min-w-0 truncate ui-text-subtle">
          {{ fileName || t('settings.noFile') }}
          <template v-if="fileFormat === 'json'">
            · <span data-test="detected-format">{{ t('settings.detectedJson') }}</span>
          </template>
          <template v-else-if="fileFormat === 'html'">
            ·
            <span data-test="detected-format">
              {{
                t('settings.detectedHtml', {
                  bookmarks: htmlStats?.bookmarks ?? 0,
                  folders: htmlStats?.folders ?? 0,
                })
              }}
            </span>
          </template>
        </span>
        <input
          ref="fileInput"
          type="file"
          accept=".json,.html,.htm,application/json,text/html"
          class="hidden"
          @change="onFileChange"
        />
      </div>

      <fieldset class="text-sm">
        <div class="flex items-center gap-4">
          <BaseRadio v-model="importMode" value="merge">
            <span class="font-medium">{{ t('settings.merge') }}</span>
          </BaseRadio>
          <BaseRadio v-model="importMode" value="replace">
            <span class="font-medium">{{ t('settings.replace') }}</span>
          </BaseRadio>
        </div>
        <p class="mt-1 text-xs ui-text-faint">
          {{ importMode === 'merge' ? t('settings.mergeDesc') : t('settings.replaceDesc') }}
          <span
            v-if="fileFormat === 'html' && importMode === 'replace'"
            data-test="html-replace-hint"
          >
            {{ t('settings.htmlReplaceHint') }}
          </span>
        </p>
      </fieldset>

      <div class="flex items-center gap-3">
        <BaseButton
          size="sm"
          :disabled="fileData === null"
          :loading="importing"
          @click="requestImport"
        >
          {{ t('settings.import') }}
        </BaseButton>
        <span v-if="importResult" class="text-sm ui-text-subtle">{{ importResult }}</span>
      </div>
    </section>

    <!-- 敏感操作前的当前密码二次确认（导出/导入通用） -->
    <PasswordConfirmModal
      v-if="pendingAction"
      :title="confirmTitle"
      :busy="confirmBusy"
      :error="confirmError"
      @close="closeConfirm"
      @submit="onConfirm"
    />
  </div>
</template>
