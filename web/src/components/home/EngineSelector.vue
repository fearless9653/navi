<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEnginesStore } from '@/stores/engines';
import { BaseListbox } from '@/components/molecules';
import { Favicon } from '@/components/atoms';

const { t } = useI18n();
const engines = useEnginesStore();

// 引擎 id → 引擎，供 #trigger / #option 插槽取 favicon（ListboxOption 只承载 value/label）。
const byId = computed(() => new Map(engines.engines.map((e) => [e.id, e])));

const options = computed<{ value: number; label: string }[]>(() =>
  engines.engines.map((e) => ({ value: e.id, label: e.name })),
);

const model = computed({
  get: () => engines.currentId,
  set: (id: number | null) => {
    if (id != null) engines.select(id);
  },
});

// 触发器水印：从图标+名称的并排布局里拿出来，仅作左侧背景装饰。
const currentIconUrl = computed(() => {
  const id = model.value;
  if (id == null) return null;
  return byId.value.get(id)?.iconUrl ?? null;
});
// 加载失败时整层隐藏，避免放大后露出灰色占位块。
const watermarkFailed = ref(false);
watch(currentIconUrl, () => {
  watermarkFailed.value = false;
});
</script>

<template>
  <BaseListbox
    v-model="model"
    :options="options"
    match-trigger-width
    :aria-label="t('common.selectEngine')"
    trigger-class="engine-trigger"
  >
    <template #trigger="{ selected }">
      <span
        v-if="currentIconUrl && !watermarkFailed"
        class="engine-watermark"
        data-test="engine-watermark"
        aria-hidden="true"
      >
        <img
          :src="currentIconUrl"
          alt=""
          referrerpolicy="no-referrer"
          class="engine-watermark__img"
          @error="watermarkFailed = true"
        />
      </span>
      <span class="engine-trigger__name flex-1 truncate text-center" :title="selected?.label">{{
        selected?.label ?? '—'
      }}</span>
    </template>

    <template #option="{ option }">
      <Favicon
        v-if="byId.get(option.value as number)?.iconUrl"
        :src="byId.get(option.value as number)!.iconUrl!"
        size="h-4 w-4"
      />
      <span class="truncate">{{ option.label }}</span>
    </template>
  </BaseListbox>
</template>

<style scoped>
/* 引擎触发器：沿用原生 select 时期的外观——占满搜索框左侧、右侧分隔线、无边框圆角。
   不再放折叠箭头，hover 背景已足够提示可点击。
   trigger-class 落在 BaseListbox 渲染的按钮上（非本组件根，故用 :deep 穿透）；
   本组件根（BaseDropdown 的 .dropdown）带本组件 scope id，:deep 得以命中该按钮。
   relative + overflow 给左侧水印做定位与圆角裁切；下拉浮层经 Teleport 挂到 body，不会被裁掉。 */
:deep(.engine-trigger) {
  position: relative;
  overflow: hidden;
  display: flex;
  height: 100%;
  width: 7rem;
  align-items: center;
  border-right: 1px solid var(--color-border);
  border-top-left-radius: 2rem;
  border-bottom-left-radius: 2rem;
  padding: var(--spacing-3);
  font-size: 0.875rem;
  color: var(--color-text-muted, var(--color-text-secondary));
}
:deep(.engine-trigger):hover {
  background-color: var(--color-row-hover);
}
/* 悬浮时保持分隔线中性：BaseListbox 默认会把触发器边框转 accent，但引擎触发器只有右侧分隔线，
   变蓝后成一条扎眼的强调色描边；背景变化已足够表达可交互，故覆盖回中性色。
   加 :not(:disabled) 使特异性(0,4,0)稳压 BaseListbox 的 hover 规则(0,3,0)。 */
:deep(.engine-trigger):not(:disabled):hover {
  border-color: var(--color-border);
}

/* 名称叠在水印之上。字重略低于纯粗体，颜色提到主文字，并加一层跟随表面色的柔光，
   减轻叠在圆形水印上的发糊（无法保证完全不重叠）。 */
.engine-trigger__name {
  position: relative;
  z-index: 1;
  font-weight: 600;
  color: var(--color-text-primary);
  text-shadow:
    0 0 6px color-mix(in srgb, var(--color-surface) 80%, transparent),
    0 1px 1px color-mix(in srgb, var(--color-surface) 70%, transparent);
}

/* 水印贴左、与触发器同高；遮罩加在未旋转的包裹层上，让「左上实、右下虚」保持屏幕方向。
   圆标内切于方画布，左上角约 15% 是空的，故实色维持到圆心附近，再向右下在圆周处收虚。 */
.engine-watermark {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  height: 100%;
  pointer-events: none;
  -webkit-mask-image: linear-gradient(135deg, #000 0 50%, transparent 86%);
  mask-image: linear-gradient(135deg, #000 0 50%, transparent 86%);
}
.engine-watermark__img {
  display: block;
  height: 100%;
  width: auto;
  max-width: none;
  object-fit: contain;
  transform: rotate(-30deg);
  transform-origin: center center;
}
</style>
