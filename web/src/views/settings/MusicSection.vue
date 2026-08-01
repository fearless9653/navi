<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePrefsStore } from '@/stores/prefs';
import { BaseButton } from '@/components/atoms';
import { ListToolbar } from '@/components/molecules';
import MusicEditModal from '@/components/manage/MusicEditModal.vue';
import { useConfirm } from '@/composables/useConfirm';
import { useDragReorder } from '@/composables/useDragReorder';
import type { MusicTrack } from '@/api/types';

const { t } = useI18n();
const prefs = usePrefsStore();
const { confirm } = useConfirm();

const tracks = ref<MusicTrack[]>([]);
const modalOpen = ref(false);
const editingIndex = ref<number | null>(null);
const savedField = ref('');

const MAX_TRACKS = 20;

const editingTrack = computed(() =>
  editingIndex.value !== null ? (tracks.value[editingIndex.value] ?? null) : null,
);

function openNew(): void {
  if (tracks.value.length >= MAX_TRACKS) return;
  editingIndex.value = null;
  modalOpen.value = true;
}

function openEdit(index: number): void {
  editingIndex.value = index;
  modalOpen.value = true;
}

function onSaved(track: MusicTrack): void {
  if (editingIndex.value !== null) {
    tracks.value[editingIndex.value] = track;
  } else {
    if (tracks.value.some((t) => t.url === track.url)) return;
    tracks.value.push(track);
  }
  modalOpen.value = false;
}

async function removeTrack(index: number): Promise<void> {
  if (!(await confirm({ message: t('manage.confirmDelete') }))) return;
  tracks.value.splice(index, 1);
}

const { dragIndex, overIndex, onPointerDown } = useDragReorder((from, to) => {
  const [moved] = tracks.value.splice(from, 1);
  tracks.value.splice(to, 0, moved!); // 仅改本地数组，点「保存」才落库
});

async function save(): Promise<void> {
  await prefs.update({ musicPlaylist: tracks.value as any });
  savedField.value = 'music';
  setTimeout(() => {
    if (savedField.value === 'music') savedField.value = '';
  }, 1500);
}

onMounted(async () => {
  await prefs.load();
  if (prefs.prefs?.musicPlaylist) {
    try {
      tracks.value = JSON.parse(prefs.prefs.musicPlaylist) as MusicTrack[];
    } catch {
      tracks.value = [];
    }
  }
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <ListToolbar @new="openNew" />
      <span class="text-xs ui-text-faint">
        {{ t('settings.musicMaxHint', { max: MAX_TRACKS, current: tracks.length }) }}
      </span>
    </div>

    <ul class="rounded-lg ui-surface-translucent">
      <li
        v-for="(track, idx) in tracks"
        :key="track.url"
        :data-drag-index="idx"
        class="ui-row-hover flex items-center justify-between border-b ui-divider px-3 py-2 text-sm first:rounded-t-lg last:rounded-b-lg last:border-0"
        :class="{
          'opacity-40': dragIndex === idx,
          'ui-active': overIndex === idx && dragIndex !== null && dragIndex !== idx,
        }"
      >
        <span class="flex min-w-0 items-center gap-2">
          <span
            class="-ml-1 flex h-7 w-7 shrink-0 cursor-grab touch-none select-none items-center justify-center ui-text-faint active:cursor-grabbing"
            :aria-label="t('common.dragToReorder')"
            :title="t('common.dragToReorder')"
            @pointerdown="onPointerDown(idx, $event)"
            >⠿</span
          >
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ track.name }}</span>
            <span class="block truncate text-xs ui-text-faint">{{ track.url }}</span>
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-3">
          <button class="ui-link" @click="openEdit(idx)">
            {{ t('common.edit') }}
          </button>
          <button class="ui-link-danger" @click="removeTrack(idx)">
            {{ t('common.delete') }}
          </button>
        </span>
      </li>
      <li v-if="!tracks.length" class="px-3 py-8 text-center ui-text-faint">
        {{ t('settings.musicEmpty') }}
      </li>
    </ul>

    <div class="flex items-center gap-3">
      <BaseButton size="sm" @click="save">
        <span v-if="savedField === 'music'" class="flex items-center gap-1">
          {{ t('common.saved') }}
        </span>
        <span v-else>{{ t('common.save') }}</span>
      </BaseButton>
      <span class="text-xs ui-text-faint">
        {{ t('settings.musicDesc') }}
      </span>
    </div>
  </div>

  <MusicEditModal
    v-if="modalOpen"
    :track="editingTrack"
    @saved="onSaved"
    @close="modalOpen = false"
  />
</template>
