<script setup lang="ts">
import { RouterView } from 'vue-router';
import { ToastHost, ConfirmHost } from '@/components/molecules';
import { useHomeNoSelect } from '@/composables/useHomeNoSelect';

useHomeNoSelect();
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmHost />
</template>
