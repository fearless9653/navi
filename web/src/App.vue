<script setup lang="ts">
import { RouterView } from 'vue-router';
import { ToastHost, ConfirmHost } from '@/components/molecules';
import { usePageNoSelect } from '@/composables/usePageNoSelect';

usePageNoSelect();
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmHost />
</template>
