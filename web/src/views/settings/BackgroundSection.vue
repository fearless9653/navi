<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePrefsStore } from '@/stores/prefs';
import { useBingWallpaper } from '@/composables/useBingWallpaper';
import { BaseButton, BaseInput, BaseRadio } from '@/components/atoms';

const { t } = useI18n();
const prefs = usePrefsStore();

// 背景设置
const backgroundType = ref<'none' | 'bing' | 'custom'>('none');
const backgroundImageUrl = ref('');
const backgroundOpacityLight = ref(70);
const backgroundOpacityDark = ref(70);
const savedField = ref('');

// Bing 壁纸（始终初始化，用于预览）
const bingWallpaper = useBingWallpaper();

// 当前壁纸预览 URL
const currentWallpaperUrl = computed(() => {
  if (backgroundType.value === 'bing' && bingWallpaper.url.value) {
    return bingWallpaper.url.value;
  }
  if (backgroundType.value === 'custom' && backgroundImageUrl.value) {
    return backgroundImageUrl.value;
  }
  return null;
});

// 透明度警告
const showLightOpacityWarning = computed(() => backgroundOpacityLight.value < 30);
const showDarkOpacityWarning = computed(() => backgroundOpacityDark.value < 30);

// 保存背景设置
async function save(): Promise<void> {
  const patch: any = {
    backgroundType: backgroundType.value,
    backgroundOpacityLight: backgroundOpacityLight.value,
    backgroundOpacityDark: backgroundOpacityDark.value,
  };

  // 仅在 custom 模式下更新 URL（其他模式保留数据库中的值）
  if (backgroundType.value === 'custom') {
    patch.backgroundImageUrl = backgroundImageUrl.value || null;
  }

  await prefs.update(patch);
  savedField.value = 'background';
  setTimeout(() => {
    if (savedField.value === 'background') savedField.value = '';
  }, 1500);
}

onMounted(async () => {
  await prefs.load();
  if (prefs.prefs) {
    backgroundType.value = prefs.prefs.backgroundType || 'none';
    backgroundImageUrl.value = prefs.prefs.backgroundImageUrl || '';
    backgroundOpacityLight.value = prefs.prefs.backgroundOpacityLight ?? 70;
    backgroundOpacityDark.value = prefs.prefs.backgroundOpacityDark ?? 70;
  }
});
</script>

<template>
  <div
    data-test="background-surface"
    class="max-w-xl space-y-8 rounded-lg p-4 ui-surface-translucent shadow-sm sm:p-5"
  >
    <!-- 背景类型选择 -->
    <section class="space-y-3">
      <h2 class="ui-section-title">
        {{ t('settings.backgroundType') }}
      </h2>

      <div class="flex flex-col items-start gap-3">
        <!-- 选项1: 不设置背景 -->
        <BaseRadio v-model="backgroundType" value="none">
          {{ t('settings.backgroundTypeNone') }}
        </BaseRadio>

        <!-- 选项2: Bing 每日壁纸 -->
        <BaseRadio v-model="backgroundType" value="bing">
          {{ t('settings.backgroundTypeBing') }}
        </BaseRadio>

        <!-- 选项3: 自定义 URL -->
        <BaseRadio v-model="backgroundType" value="custom">
          {{ t('settings.backgroundTypeCustom') }}
        </BaseRadio>

        <!-- 自定义 URL 输入（仅在选中时显示）-->
        <div v-if="backgroundType === 'custom'" class="ml-6 w-full max-w-md">
          <BaseInput
            v-model="backgroundImageUrl"
            type="url"
            size="sm"
            :placeholder="t('settings.backgroundImageUrlPlaceholder')"
            :hint="t('settings.backgroundImageDesc')"
          />
        </div>
      </div>
    </section>

    <!-- 当前壁纸预览 -->
    <section v-if="currentWallpaperUrl" class="space-y-3">
      <h2 class="ui-section-title">
        {{ t('settings.currentWallpaperPreview') }}
      </h2>
      <div
        class="overflow-hidden rounded-lg border ui-border"
        style="width: 80%; aspect-ratio: 16/9"
      >
        <img
          :src="currentWallpaperUrl"
          alt="Current Wallpaper"
          class="w-full h-full object-cover"
        />
      </div>
    </section>

    <!-- 背景可见度 -->
    <section class="space-y-4">
      <h2 class="ui-section-title">
        {{ t('settings.backgroundOpacitySection') }}
      </h2>

      <!-- 白天模式 -->
      <div class="space-y-1">
        <label class="flex items-center justify-between text-sm font-medium">
          <span>{{ t('settings.backgroundOpacityLight') }}</span>
          <span class="ui-text-subtle">{{ backgroundOpacityLight }}%</span>
        </label>
        <input
          v-model.number="backgroundOpacityLight"
          type="range"
          min="0"
          max="100"
          step="10"
          class="w-full"
        />
        <p v-if="showLightOpacityWarning" class="text-xs ui-status-warning">
          ⚠️ {{ t('settings.backgroundOpacityWarning') }}
        </p>
      </div>

      <!-- 黑暗模式 -->
      <div class="space-y-1">
        <label class="flex items-center justify-between text-sm font-medium">
          <span>{{ t('settings.backgroundOpacityDark') }}</span>
          <span class="ui-text-subtle">{{ backgroundOpacityDark }}%</span>
        </label>
        <input
          v-model.number="backgroundOpacityDark"
          type="range"
          min="0"
          max="100"
          step="10"
          class="w-full"
        />
        <p v-if="showDarkOpacityWarning" class="text-xs ui-status-warning">
          ⚠️ {{ t('settings.backgroundOpacityWarning') }}
        </p>
      </div>
    </section>

    <!-- 保存按钮 -->
    <BaseButton size="sm" @click="save">
      <span v-if="savedField === 'background'" class="flex items-center gap-1">
        ✓ {{ t('common.saved') }}
      </span>
      <span v-else>{{ t('common.save') }}</span>
    </BaseButton>
  </div>
</template>
