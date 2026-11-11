<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput, BaseTextarea, BaseButton, BaseCheckbox, Favicon } from '@/components/atoms';
import TagCascadePopover from '@/components/tags/TagCascadePopover.vue';
import TagChips from '@/components/tags/TagChips.vue';
import { api, ApiException } from '@/api/client';
import type { Bookmark } from '@/api/types';
import { useBookmarksStore } from '@/stores/bookmarks';
import { useTagsStore } from '@/stores/tags';
import { useToast } from '@/composables/useToast';
import { asLimitError } from '@/lib/limitError';

const props = defineProps<{ bookmark: Bookmark | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();
const { t, locale } = useI18n();
const bm = useBookmarksStore();
const tagsStore = useTagsStore();
const toast = useToast();

const url = ref(props.bookmark?.url ?? '');
const name = ref(props.bookmark?.name ?? '');
const description = ref(props.bookmark?.description ?? '');
const DEFAULT_BOOKMARK_WEIGHT = 100;
const weight = ref(props.bookmark?.weight ?? DEFAULT_BOOKMARK_WEIGHT);
const isActive = ref(props.bookmark?.isActive ?? true);
const faviconUrl = ref<string | null>(props.bookmark?.faviconUrl ?? null);
const selected = ref<number[]>(props.bookmark?.tags.map((x) => x.id) ?? []);
const fetching = ref(false);
const saving = ref(false);

const selectedTags = computed(() =>
  // 从全量标签映射查找已选标签（picker 已 loadAll，此处零请求）
  selected.value.map((id) => tagsStore.byId.get(id)).filter((tg) => tg !== undefined),
);

function removeTag(id: number): void {
  selected.value = selected.value.filter((x) => x !== id);
}

onMounted(async () => {
  // 一次性加载全量标签（selectedTags 映射与 picker 级联共用）
  await tagsStore.loadAll();
});

async function doFetch(): Promise<void> {
  const u = url.value.trim();
  if (!u) return;
  fetching.value = true;
  try {
    const r = await api.post<{
      metadata: { title: string | null; description: string | null; faviconUrl: string | null };
    }>('/fetch/metadata', { url: u }, { 'Accept-Language': String(locale.value) });
    if (r.metadata.title) name.value = r.metadata.title;
    if (r.metadata.description) description.value = r.metadata.description;
    if (r.metadata.faviconUrl) faviconUrl.value = r.metadata.faviconUrl;
    if (!r.metadata.title && !r.metadata.description) toast.warning(t('manage.fetchEmpty'));
  } catch {
    // 抓取失败：保持已填内容，并给出提示。
    toast.danger(t('manage.fetchFailed'));
  } finally {
    fetching.value = false;
  }
}

async function save(): Promise<void> {
  saving.value = true;
  try {
    const payload = {
      url: url.value.trim(),
      name: name.value.trim(),
      description: description.value.trim() || null,
      // 清空输入框得到 ''，后端 z.string().url() 会拒绝，归一化为 null。
      faviconUrl: faviconUrl.value?.trim() || null,
      // number 输入清空时 v-model.number 得到 ''，回到新建网址的默认权重。
      weight:
        typeof weight.value === 'number' && Number.isFinite(weight.value)
          ? weight.value
          : DEFAULT_BOOKMARK_WEIGHT,
      isActive: isActive.value,
      tagIds: selected.value,
    };
    if (props.bookmark) await bm.update(props.bookmark.id, payload);
    else await bm.create(payload);
    emit('saved');
  } catch (e) {
    const limit = asLimitError(e);
    if (limit) toast.danger(t(`limits.${limit.resource}`, { limit: limit.limit }));
    else if (e instanceof ApiException && e.status === 409) toast.danger(t('manage.urlTaken'));
    else toast.danger(t('manage.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <BaseModal
    :title="props.bookmark ? t('manage.editBookmark') : t('manage.newBookmark')"
    :busy="saving"
    @submit="save"
    @close="emit('close')"
  >
    <BaseInput v-model="url" type="url" :label="t('manage.url')" required>
      <template #append>
        <BaseButton variant="secondary" size="md" :loading="fetching" @click="doFetch">
          {{ fetching ? t('manage.fetching') : t('manage.fetch') }}
        </BaseButton>
      </template>
    </BaseInput>

    <BaseInput
      v-model="faviconUrl"
      type="url"
      :label="t('manage.faviconUrl')"
      placeholder="https://example.com/favicon.ico"
    >
      <template v-if="faviconUrl" #append>
        <Favicon :src="faviconUrl" size="h-5 w-5" />
      </template>
    </BaseInput>

    <BaseInput v-model="name" :label="t('manage.name')" required />

    <BaseTextarea v-model="description" :label="t('manage.description')" :rows="2" />

    <BaseInput
      v-model.number="weight"
      type="number"
      :label="t('manage.weight')"
      :hint="t('manage.weightHint')"
    />

    <BaseCheckbox v-model="isActive">
      {{ t('manage.statusActive') }}
    </BaseCheckbox>

    <div class="block text-sm">
      <span class="ui-text-subtle">{{ t('manage.tags') }}</span>
      <!-- 紧凑：点按钮浮出级联选择器 -->
      <div class="mt-1">
        <TagCascadePopover v-model="selected" :label="t('manage.chooseTags')" />
      </div>
      <!-- 已选标签常驻一行（空时也占位，不撑动弹框） -->
      <div class="mt-2 flex min-h-7 flex-wrap items-center gap-1">
        <TagChips :tags="selectedTags" @remove="removeTag" />
      </div>
    </div>
  </BaseModal>
</template>
