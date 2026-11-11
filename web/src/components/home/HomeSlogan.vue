<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSloganFont } from '@/composables/useSloganFont';
import { parseSlogan, type SloganSegment } from '@/lib/sloganMarkup';

const props = withDefaults(
  defineProps<{
    slogan: string;
    /**
     * 锚定模式（首页专用）：把外框固定为一行高度、文本底部对齐，超长标语向上溢出生长，
     * 不向下挤压搜索框。默认 false —— 设置页预览等复用场景走自然流式高度、随内容撑高。
     */
    anchored?: boolean;
  }>(),
  { anchored: false },
);

const { t } = useI18n();
const { sloganFontStyle } = useSloganFont();

const segments = computed<SloganSegment[]>(() => parseSlogan(props.slogan));

// bold 映射 900：标语默认字重 600，加粗 900 拉开两档差距才显眼（多数字体 700↔900 几乎无差）。
function segStyle(seg: SloganSegment): Record<string, string> {
  const s: Record<string, string> = {};
  if (seg.bold) s['font-weight'] = '900';
  if (seg.italic) s['font-style'] = 'italic';
  if (seg.strike) s['text-decoration'] = 'line-through';
  if (seg.color) s['color'] = seg.color;
  return s;
}
</script>

<template>
  <section
    class="home-slogan-wrap"
    :class="{ 'is-anchored': anchored }"
    :aria-label="t('home.sloganAria')"
  >
    <p data-test="home-slogan" class="home-slogan" :style="sloganFontStyle">
      <span v-for="(seg, i) in segments" :key="i" :style="segStyle(seg)">{{ seg.text }}</span>
    </p>
  </section>
</template>

<style scoped>
.home-slogan-wrap {
  /* 宽度对齐搜索框（max-w-2xl / md:max-w-3xl / xl:52rem），使每行字数随搜索框加宽而增加。 */
  width: 100%;
  max-width: 42rem;
  display: flex;
  justify-content: center;
  padding-inline: var(--spacing-3);
}

/* 锚定模式（首页专用）：固定为一行高度 + 文本底部对齐，超长标语向上溢出生长，
   不向下挤压搜索框——搜索框位置恒由这一行高度锚定（与 HomeView 的
   .home-slogan-placeholder 同高，故有/无标语、单/多行时搜索框垂直位置始终一致）。
   非锚定（设置页预览等）走自然流式高度，随内容撑高。 */
.home-slogan-wrap.is-anchored {
  /* overflow 保持默认 visible 让文本上溢。 */
  height: calc(clamp(1.625rem, 3.5vw, 2.5rem) * 1.35);
  /* flex 列里 min-height 默认 auto（=内容高），多行会撑开盒子把搜索框推下；
     锁 min-height:0 + flex-shrink:0，盒子恒为一行高，多行内容向上 overflow 不撑开。 */
  min-height: 0;
  flex-shrink: 0;
  align-items: flex-end;
}

/* 宽度断点与 WebSearchHero 的 md:max-w-3xl / xl:max-w-[52rem] 对齐。 */
@media (min-width: 768px) {
  .home-slogan-wrap {
    max-width: 48rem;
  }
}
@media (min-width: 1280px) {
  .home-slogan-wrap {
    max-width: 52rem;
  }
}

.home-slogan {
  max-width: 100%;
  margin: 0;
  color: var(--color-text-primary);
  font-size: clamp(1.625rem, 3.5vw, 2.5rem);
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 0;
  text-align: center;
  white-space: pre-wrap;
  text-shadow: 0 1px 14px color-mix(in srgb, var(--color-surface) 82%, transparent);
}
</style>
