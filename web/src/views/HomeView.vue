<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AppLayout from '@/layouts/AppLayout.vue';
import HomeSlogan from '@/components/home/HomeSlogan.vue';
import WebSearchHero from '@/components/home/WebSearchHero.vue';
import HomeRails, { type RailKey } from '@/components/home/HomeRails.vue';
import TagCascadePopover from '@/components/tags/TagCascadePopover.vue';
import TagChips from '@/components/tags/TagChips.vue';
import BookmarkGrid from '@/components/home/BookmarkGrid.vue';
import MusicPlayer from '@/components/home/MusicPlayer.vue';
import ShortcutHelpModal from '@/components/home/ShortcutHelpModal.vue';
import { BaseSelect } from '@/components/atoms';
import { Pagination } from '@/components/molecules';
import BookmarkEditModal from '@/components/manage/BookmarkEditModal.vue';
import { useAuthStore } from '@/stores/auth';
import { useEnginesStore } from '@/stores/engines';
import { useTagsStore } from '@/stores/tags';
import { usePrefsStore } from '@/stores/prefs';
import { useBookmarksStore } from '@/stores/bookmarks';
import { useMusicStore } from '@/stores/music';
import { useResponsivePageSize } from '@/composables/useResponsivePageSize';
import { useResponsivePanelCount } from '@/composables/useResponsivePanelCount';
import { useHotkeys } from '@/composables/useHotkeys';
import { useGridNavigation } from '@/composables/useGridNavigation';
import type { Bookmark, SortKey } from '@/api/types';

const { t } = useI18n();
const auth = useAuthStore();
const engines = useEnginesStore();
const tagsStore = useTagsStore();
const prefs = usePrefsStore();
const bm = useBookmarksStore();
const music = useMusicStore();
const gridContainer = ref<HTMLElement | null>(null);
const nav = useGridNavigation(gridContainer);
const {
  pageSize: responsivePageSize,
  rowGap: gridRowGap,
  cols: gridCols,
} = useResponsivePageSize(gridContainer);
const railsAside = ref<HTMLElement | null>(null);
const { panelCount: responsivePanelCount } = useResponsivePanelCount(railsAside);

// 侧栏当前选中的面板（受控，驱动 HomeRails 的单开高亮 + 本页懒加载）。默认最近访问。
const currentRail = ref<RailKey>('recent');

/**
 * 懒加载：只拉「当前选中面板」的数据，避免进页就把四榜单全拉一遍。
 * recent 走 /bookmarks/recent；三榜单（visits/weight/created）共用一次 /bookmarks/top
 *（返回三份），故切到任一榜单只发一次请求、榜单间再切走缓存命中。
 */
function loadSelectedRail(): Promise<unknown> {
  const n = responsivePanelCount.value;
  return currentRail.value === 'recent' ? bm.loadRecent(n) : bm.loadTops(n);
}

watch(responsivePageSize, (newSize, oldSize) => {
  if (oldSize !== undefined && newSize !== oldSize && auth.isAuthed) {
    bm.pageSize = newSize;
    bm.setPage(1);
    void bm.load({ detail: false });
  }
});

watch(responsivePanelCount, (newCount, oldCount) => {
  if (oldCount !== undefined && newCount !== oldCount && auth.isAuthed) {
    void loadSelectedRail();
  }
});

// 用户切换面板：重拉新选中面板（三榜单间切换命中 /top 缓存、不重复请求）。
watch(currentRail, () => {
  if (auth.isAuthed) void loadSelectedRail();
});

const SORTS: SortKey[] = ['weight', 'name', 'recent', 'created', 'visits'];
const sortOptions = computed<{ value: SortKey; label: string }[]>(() =>
  SORTS.map((s) => ({ value: s, label: t('sort.' + s) })),
);

const modalOpen = ref(false);
const editing = ref<Bookmark | null>(null);
// 标语：渲染用原始值（保留用户首尾空格排版意图）；判空单独走 trim，纯空格视为无标语。
const slogan = computed(() => prefs.prefs?.slogan ?? '');
const sloganVisible = computed(() => (prefs.prefs?.slogan ?? '').trim() !== '');

// 选中标签 → 写入 store 并重新查询（交集 + 父含子在后端完成）。
const selectedTagIds = computed<number[]>({
  get: () => bm.selectedTagIds,
  set: (ids) => {
    bm.setTagIds(ids);
    void bm.load({ detail: false });
  },
});
const selectedTags = computed(() => {
  // 从全量标签映射解析已选标签
  const byId = tagsStore.byId;
  return selectedTagIds.value.map((id) => byId.get(id)).filter((tg) => tg !== undefined);
});
function removeTag(id: number): void {
  selectedTagIds.value = selectedTagIds.value.filter((x) => x !== id);
}
function clearTags(): void {
  selectedTagIds.value = [];
}

const totalPages = computed(() => Math.max(1, Math.ceil(bm.total / bm.pageSize)));

let qTimer: ReturnType<typeof setTimeout> | undefined;
function onQuery(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    bm.setQuery(v);
    void bm.load({ detail: false });
  }, 250);
}

/** 切换排序：写入 store（含 page 重置）并重载。仅当前会话生效，不写回偏好。 */
function onSortChange(value: SortKey): void {
  bm.setSort(value);
  void bm.load({ detail: false });
}

function changePage(p: number): void {
  bm.setPage(p);
  void bm.load({ detail: false });
}

function openAddBookmark(): void {
  editing.value = null;
  modalOpen.value = true;
}

function onEditBookmark(bookmark: Bookmark): void {
  editing.value = bookmark;
  modalOpen.value = true;
}

function closeModal(): void {
  modalOpen.value = false;
  editing.value = null;
}

async function onSaved(): Promise<void> {
  closeModal();
  // 增改删会影响榜单/最近访问；写操作已失效侧栏缓存，这里只需重拉当前可见面板，
  // 其余面板等切换到时再按需拉取。
  await Promise.all([bm.load({ force: true, detail: false }), loadSelectedRail()]);
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible' && auth.isAuthed) {
    void loadSelectedRail();
  }
}

// ---------- 键盘快捷键（设计见 docs：/ 与 Ctrl+K 聚焦搜索，n 新建，s 筛选，? 帮助） ----------
const searchHero = ref<InstanceType<typeof WebSearchHero> | null>(null);
const tagSearchInput = ref<HTMLInputElement | null>(null);
const helpOpen = ref(false);

/** 任一弹窗打开时，页面级快捷键让位（弹窗内 Esc/Tab 已由 BaseModal 处理）。 */
function noModalOpen(): boolean {
  return !modalOpen.value && !helpOpen.value;
}

function focusWebSearch(): void {
  searchHero.value?.focusInput();
}

function focusTagSearch(): void {
  const el = tagSearchInput.value;
  if (!el) return;
  el.focus();
  el.select();
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** 筛选搜索框内 Esc：清空（含防抖中的查询）并失焦。 */
function onTagSearchEscape(e: KeyboardEvent): void {
  const el = e.target as HTMLInputElement;
  el.value = '';
  clearTimeout(qTimer);
  if (bm.query) {
    bm.setQuery('');
    void bm.load({ detail: false });
  }
  el.blur();
}

useHotkeys([
  { key: '/', enabled: noModalOpen, handler: focusWebSearch },
  {
    key: 'k',
    ctrlOrMeta: true,
    allowInEditable: true,
    enabled: noModalOpen,
    handler: focusWebSearch,
  },
  { key: 'n', enabled: () => auth.isAuthed && noModalOpen(), handler: openAddBookmark },
  { key: 's', enabled: () => auth.isAuthed && noModalOpen(), handler: focusTagSearch },
  {
    key: 'p',
    enabled: () => auth.isAuthed && music.hasPlaylist && noModalOpen(),
    handler: () => music.toggle(),
  },
  { key: 'g', enabled: () => auth.isAuthed && noModalOpen(), handler: () => nav.focusFirst() },
  {
    key: 'ArrowUp',
    allowRepeat: true,
    repeatIntervalMs: 100,
    enabled: () => auth.isAuthed && noModalOpen() && nav.isInGrid(),
    handler: () => nav.move('up'),
  },
  {
    key: 'ArrowDown',
    allowRepeat: true,
    repeatIntervalMs: 100,
    enabled: () => auth.isAuthed && noModalOpen() && nav.isInGrid(),
    handler: () => nav.move('down'),
  },
  {
    key: 'ArrowLeft',
    allowRepeat: true,
    repeatIntervalMs: 100,
    enabled: () => auth.isAuthed && noModalOpen() && nav.isInGrid(),
    handler: () => nav.move('left'),
  },
  {
    key: 'ArrowRight',
    allowRepeat: true,
    repeatIntervalMs: 100,
    enabled: () => auth.isAuthed && noModalOpen() && nav.isInGrid(),
    handler: () => nav.move('right'),
  },
  {
    key: 'Escape',
    enabled: () => auth.isAuthed && noModalOpen() && nav.isInGrid(),
    handler: () => nav.blur(),
  },
  { key: '?', enabled: noModalOpen, handler: () => (helpOpen.value = true) },
]);

onMounted(async () => {
  await engines.load();
  if (!auth.isAuthed) return;
  bm.loading = true;
  try {
    // 全量标签一次性加载（级联/卡片映射共用）；prefs 仅在未就绪时拉——
    // AppLayout / MusicPlayer 挂载时（子组件先于本 onMounted）已发起 prefs 加载，
    // 此处无条件再调会在其请求返回后又发一次（in-flight 去重挡不住已完成的），故加守卫。
    await Promise.all([tagsStore.loadAll(), prefs.prefs ? Promise.resolve() : prefs.load()]);
    if (prefs.prefs) {
      bm.pageSize = responsivePageSize.value;
      if (SORTS.includes(prefs.prefs.defaultSort as SortKey)) {
        bm.sort = prefs.prefs.defaultSort as SortKey;
      }
    }
  } catch {
    // 预加载（标签/偏好）失败不致命：吞掉以继续拉列表。loading 由手动置真，
    // 若在此中断则永远无人复位、卡死骨架屏——故必接住，交由下方 bm.load 统一收口。
  }
  // 懒加载：初次只拉默认面板（最近访问），三榜单等用户切过去时再拉。
  // bm.load 自身吞错并管理 loading/error；loadSelectedRail 独立接住，侧栏失败不牵连主列表、不产生未处理 rejection。
  await Promise.all([bm.load({ detail: false }), loadSelectedRail().catch(() => {})]);
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  clearTimeout(qTimer); // 卸载时清掉可能在途的搜索防抖，避免向已离开视图的 store 发起请求
});
</script>

<template>
  <AppLayout>
    <!-- 游客：裸搜索页。下压量（pt）与 slogan 占位行刻意与登录态那一套完全一致，
         使登录前后搜索框的垂直位置基本不变、切换登录态时不跳动。
         游客无偏好故永远无标语，直接用占位行补齐登录态 slogan 所占的一行高度。 -->
    <div
      v-if="!auth.isAuthed"
      class="flex flex-col items-center gap-6 pt-8 md:pt-[clamp(1.5rem,18vh,14rem)]"
    >
      <div class="home-slogan-placeholder" aria-hidden="true" data-test="home-slogan-placeholder" />
      <WebSearchHero ref="searchHero" />
    </div>

    <!-- 登录：异型布局 -->
    <div v-else class="flex flex-1 flex-col gap-6">
      <!-- 顶部 slogan + 居中网页搜索：整体下压释放上方视觉空间、降低视觉压力，视点接近 Chrome/Bing 之间。
           下压后 hero 下沿位置改变，侧栏面板条数与网址行数（均实测下沿反解可用高度、挂 ResizeObserver）
           自动少量收敛，无需改动其常量。clamp 令矮屏收敛不挤爆、高屏封顶。
           gap-6：拉开 slogan 与搜索框的间距（配合 pt 使 slogan 上移、搜索框基本定位不变）。 -->
      <div class="flex flex-col items-center gap-6 pt-8 md:pt-[clamp(1.5rem,18vh,14rem)]">
        <!-- 无标语时仍预留一行高度，使搜索框位置与有标语时一致、首屏不跳动。 -->
        <HomeSlogan v-if="sloganVisible" :slogan="slogan" anchored />
        <div
          v-else
          class="home-slogan-placeholder"
          aria-hidden="true"
          data-test="home-slogan-placeholder"
        />
        <WebSearchHero ref="searchHero" />
      </div>

      <!-- 侧栏单开分段面板 + 网址列表两列：单面板不需要 2×2 时代的宽度，收回 15/18/20rem（lg/xl/2xl）。
           网址卡片为流式宽度、列数只随网格实测宽反解，故侧栏收窄只让卡片更宽、不直接决定列数。
           <1024px 坍缩为单列：侧栏堆叠在网址列表上方。 -->
      <div
        class="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[15rem_1fr] xl:grid-cols-[18rem_1fr] 2xl:grid-cols-[20rem_1fr]"
      >
        <aside ref="railsAside" class="ui-divider lg:border-r lg:pr-6">
          <HomeRails v-model:selected="currentRail" />
        </aside>

        <section class="flex flex-1 flex-col gap-4">
          <!-- 行 A：标签筛选（左） + 已选标签 + 模糊搜索（右，小） -->
          <div class="flex flex-wrap items-center gap-3">
            <TagCascadePopover v-model="selectedTagIds" />
            <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <TagChips :tags="selectedTags" @remove="removeTag" />
              <button
                v-if="selectedTagIds.length"
                class="text-xs ui-link-danger"
                @click="clearTags"
              >
                {{ t('common.clear') }}
              </button>
            </div>
            <!-- 搜索框 + 排序：移动端同行，桌面端 inline 在筛选行末尾 -->
            <div class="flex w-full items-center gap-2 sm:w-auto sm:gap-3">
              <input
                ref="tagSearchInput"
                type="search"
                :placeholder="t('home.searchInTags')"
                :aria-label="t('home.searchInTags')"
                aria-keyshortcuts="s"
                class="min-w-0 flex-1 rounded-lg ui-field-sm ui-search sm:w-56 sm:flex-none"
                @input="onQuery"
                @keydown.esc.prevent="onTagSearchEscape"
              />
              <!-- 排序：值取自默认排序偏好，切换仅当前会话生效，不写回偏好 -->
              <BaseSelect
                id="home-sort-select"
                :model-value="bm.sort"
                :options="sortOptions"
                :aria-label="t('common.sortBy')"
                size="sm"
                class="shrink-0"
                @change="onSortChange"
              />
            </div>
          </div>

          <!-- 分隔线：筛选区 vs 结果区 -->
          <div class="border-t ui-divider" />

          <!-- --bm-cols / --bm-row-gap：列数按网格实测宽度反解、行数余数均摊为行距
               （useResponsivePageSize），BookmarkGrid 仅在 ≥1024px 消费；
               对末页不满同样生效，保证各页纵向节奏一致。 -->
          <div
            ref="gridContainer"
            class="flex-1"
            :style="{ '--bm-row-gap': `${gridRowGap}px`, '--bm-cols': gridCols }"
          >
            <BookmarkGrid @edit="onEditBookmark" />
          </div>

          <Pagination :current="bm.page" :total="totalPages" @change="changePage" />
        </section>
      </div>
    </div>

    <!-- 悬浮添加按钮：仅登录用户可见；键盘可用 N 直达。
         扁平实心 accent FAB：无阴影 / 无立体质感；hover 抬升 + active 按压 + 键盘聚焦环。 -->
    <button
      v-if="auth.isAuthed"
      class="home-add-button fixed flex h-[70px] w-[70px] items-center justify-center rounded-full"
      :style="{ backgroundColor: 'var(--color-accent)' }"
      :aria-label="t('manage.newBookmark')"
      :title="`${t('manage.newBookmark')} (N)`"
      aria-keyshortcuts="n"
      @click="openAddBookmark"
    >
      <svg
        class="h-6 w-6 text-[var(--color-on-accent)]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>

    <!-- 添加书签弹窗 -->
    <BookmarkEditModal
      v-if="modalOpen"
      :key="editing?.id ?? 'new'"
      :bookmark="editing"
      @saved="onSaved"
      @close="closeModal"
    />

    <!-- 快捷键帮助（?） -->
    <ShortcutHelpModal v-if="helpOpen" :authed="auth.isAuthed" @close="helpOpen = false" />

    <MusicPlayer v-if="auth.isAuthed" />
  </AppLayout>
</template>

<style scoped>
/* 扁平实心圆钮：无阴影、无立体质感；仅底色过渡 + hover 抬升 / active 按压。 */
.home-add-button {
  z-index: var(--z-floating);
  right: calc(var(--spacing-6) + env(safe-area-inset-right));
  bottom: var(--home-floating-control-bottom);
  transition:
    background-color var(--duration-fast) var(--ease-out),
    transform var(--duration-base) var(--ease-back);
}

/* 悬浮：加深底色 + 微放大（不做上浮位移），无阴影 / 无辉光。 */
.home-add-button:hover {
  background-color: var(--color-accent-hover);
  transform: scale(1.05);
}

/* 按下：缩到 0.97，用 ease-out 快收。 */
.home-add-button:active {
  transform: scale(0.97);
  transition-duration: var(--duration-fast);
}

/* 仅键盘聚焦追加焦点环（鼠标点入不套环，与搜索框 focus-visible 同惯例）。 */
.home-add-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 var(--focus-ring-width) var(--color-focus-ring);
}

@media (prefers-reduced-motion: reduce) {
  .home-add-button:hover,
  .home-add-button:active {
    transform: none;
  }
}

/*
 * 无标语占位：复刻 HomeSlogan 一行的视觉高度（字号/行高与 .home-slogan 对齐），
 * 仅占位、不可见，保证无标语时搜索框垂直位置与有标语时完全一致、首屏无跳动。
 */
.home-slogan-placeholder {
  width: min(100%, 42rem);
  /* 与 HomeSlogan.vue 的 .home-slogan 字号/行高一致。 */
  font-size: clamp(1.625rem, 3.5vw, 2.5rem);
  line-height: 1.35;
  /* 空 div 不会按 line-height 撑高，显式锁一行高度并禁用 flex 收缩。 */
  min-height: calc(clamp(1.625rem, 3.5vw, 2.5rem) * 1.35);
  flex-shrink: 0;
}
</style>
