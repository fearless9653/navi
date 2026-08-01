<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePrefsStore } from '@/stores/prefs';
import { BaseButton, BaseInput, BaseSelect, BaseTextarea } from '@/components/atoms';
import { useSloganFont } from '@/composables/useSloganFont';
import { stripSloganMarkup } from '@/lib/sloganMarkup';
import HomeSlogan from '@/components/home/HomeSlogan.vue';

const { t } = useI18n();
const prefs = usePrefsStore();
const {
  selectedSloganFontFamily,
  localFontOptions,
  localFontsLoading,
  localFontsError,
  setSelectedSloganFontFamily,
  loadLocalFonts,
} = useSloganFont();

const slogan = ref('');
const savedField = ref(false);

// 字体下拉选项：默认项（空 value）+ 枚举到的本地字体。
const fontOptions = computed<{ value: string; label: string }[]>(() => [
  { value: '', label: t('settings.sloganFontDefault') },
  ...localFontOptions.value.map((f) => ({ value: f.family, label: f.family })),
]);

// 标语字数计数：格式标记不计入 80 字上限（与后端 MAX_SLOGAN_LENGTH 对齐）。
const sloganUsed = computed(() => stripSloganMarkup(slogan.value).length);
const sloganHint = computed(() =>
  sloganUsed.value > 80
    ? t('settings.sloganTooLong', { used: sloganUsed.value, max: 80 })
    : t('settings.sloganCounter', { used: sloganUsed.value, max: 80 }),
);

// 标语原始长度上限（含格式标记），与后端 src/routes/schemas.ts 的 MAX_SLOGAN_RAW_LENGTH 对齐。
// 超过时前端实时红色提示并阻断保存；统计口径为 trim 后长度，与后端 .trim().max() 一致。
const MAX_SLOGAN_RAW_LENGTH = 1000;
const sloganRawLength = computed(() => slogan.value.trim().length);
const sloganRawTooLong = computed(() => sloganRawLength.value > MAX_SLOGAN_RAW_LENGTH);

// 标语项独立保存：仅提交改动的那一项。
async function save(): Promise<void> {
  // 阻断：标语原始长度超限时不予保存（避免发出注定被后端 400 拒绝的请求）。
  if (sloganRawTooLong.value) return;
  await prefs.update({ slogan: slogan.value.trim() === '' ? null : slogan.value });
  savedField.value = true;
  setTimeout(() => {
    savedField.value = false;
  }, 1500);
}

onMounted(async () => {
  await prefs.load();
  slogan.value = prefs.prefs?.slogan ?? '';
});
</script>

<template>
  <div
    data-test="slogan-surface"
    class="max-w-xl space-y-8 rounded-lg p-4 ui-surface-translucent shadow-sm sm:p-5"
  >
    <!-- 内容：输入 + 预览 + 语法说明 -->
    <section class="space-y-3">
      <h2 class="ui-section-title">
        {{ t('settings.slogan') }}
      </h2>
      <BaseTextarea
        v-model="slogan"
        :rows="3"
        :hint="sloganRawTooLong ? undefined : sloganHint"
        :error="
          sloganRawTooLong
            ? t('settings.sloganRawTooLong', { used: sloganRawLength, max: MAX_SLOGAN_RAW_LENGTH })
            : undefined
        "
        :placeholder="t('settings.sloganPlaceholder')"
        data-test="slogan-input"
        @blur="save"
      />
      <!-- 标语预览：直接复用首页渲染器，与首页所见即所得（含字体与富文本样式）。 -->
      <div class="slogan-preview" data-test="slogan-preview">
        <p class="slogan-preview-title">{{ t('settings.sloganPreview') }}</p>
        <HomeSlogan v-if="slogan.trim()" :slogan="slogan" />
      </div>
      <p class="text-xs ui-text-faint" data-test="slogan-syntax-help">
        {{ t('settings.sloganSyntax') }}
      </p>
    </section>

    <!-- 标语字体 -->
    <section class="space-y-1">
      <h2 class="ui-section-title">
        {{ t('settings.sloganFont') }}
      </h2>
      <div class="flex items-center gap-2">
        <BaseSelect
          id="slogan-font-select"
          data-test="slogan-font-select"
          size="sm"
          class="min-w-0 flex-1"
          :options="fontOptions"
          :model-value="selectedSloganFontFamily"
          @update:model-value="(value) => setSelectedSloganFontFamily(String(value ?? ''))"
        >
          <!-- 选项按其字体自身渲染，所见即所得预览（原生 <option> 做不到）。 -->
          <template #option="{ option }">
            <span :style="option.value ? { fontFamily: String(option.value) } : undefined">
              {{ option.label }}
            </span>
          </template>
        </BaseSelect>
        <BaseButton
          type="button"
          data-test="slogan-load-local-fonts"
          variant="secondary"
          size="sm"
          :loading="localFontsLoading"
          @click="loadLocalFonts"
        >
          {{ t('settings.sloganLoadLocalFonts') }}
        </BaseButton>
      </div>
      <p class="text-xs ui-text-faint">
        {{ t('settings.sloganFontDesc') }}
      </p>
      <p v-if="localFontsError" class="text-xs ui-status-warning">
        {{ t('settings.sloganFontUnavailable') }}
      </p>
      <BaseInput
        v-model="selectedSloganFontFamily"
        size="sm"
        data-test="slogan-font-manual"
        :label="t('settings.sloganFontManual')"
        :hint="t('settings.sloganFontManualDesc')"
        :placeholder="t('settings.sloganFontManualPlaceholder')"
        @blur="setSelectedSloganFontFamily(String(selectedSloganFontFamily ?? '').trim())"
      />
    </section>
  </div>
</template>

<style scoped>
/* 标语预览：弱底色容器框出预览区，避免与真实首页混淆。 */
.slogan-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  border: 1px solid
    var(--color-border, color-mix(in srgb, var(--color-text-primary) 12%, transparent));
  border-radius: var(--radius-base);
  background: color-mix(in srgb, var(--color-surface) 60%, transparent);
}

.slogan-preview-title {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-subtle, var(--color-text-secondary));
  letter-spacing: 0.04em;
}
</style>
