<script setup lang="ts">
import { RouterView } from 'vue-router';
import { ToastHost, ConfirmHost } from '@/components/molecules';
</script>

<template>
  <RouterView />
  <ToastHost />
  <ConfirmHost />
</template>
