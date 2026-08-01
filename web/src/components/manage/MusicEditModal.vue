<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { BaseModal } from '@/components/molecules';
import { BaseInput } from '@/components/atoms';
import type { MusicTrack } from '@/api/types';

const props = defineProps<{ track: MusicTrack | null }>();
const emit = defineEmits<{ saved: [track: MusicTrack]; close: [] }>();
const { t } = useI18n();

const name = ref(props.track?.name ?? '');
const url = ref(props.track?.url ?? '');
const error = ref('');

function extractName(rawUrl: string): string {
  try {
    const pathname = new URL(rawUrl).pathname;
    const filename = pathname.split('/').pop() || '';
    const decoded = decodeURIComponent(filename.replace(/\.[^.]+$/, ''));
    return decoded || 'Untitled';
  } catch {
    return 'Untitled';
  }
}

function save(): void {
  error.value = '';
  const trimmedUrl = url.value.trim();
  if (!trimmedUrl) return;

  try {
    new URL(trimmedUrl);
  } catch {
    error.value = t('settings.musicUrlInvalid');
    return;
  }

  const trackName = name.value.trim() || extractName(trimmedUrl);
  emit('saved', { url: trimmedUrl, name: trackName });
}
</script>

<template>
  <BaseModal
    :title="track ? t('settings.musicName') : t('settings.musicAdd')"
    @submit="save"
    @close="emit('close')"
  >
    <BaseInput
      v-model="name"
      :label="t('settings.musicName')"
      :placeholder="t('settings.musicNamePlaceholder')"
    />
    <BaseInput
      v-model="url"
      :label="t('settings.musicUrl')"
      :placeholder="t('settings.musicUrlPlaceholder')"
      required
    />
    <p v-if="error" class="text-sm ui-status-danger">{{ error }}</p>
  </BaseModal>
</template>
