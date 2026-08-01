<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="ui-bg ui-text grid min-h-screen place-items-center text-center">
    <div>
      <p class="text-5xl font-bold">404</p>
      <RouterLink :to="{ name: 'home' }" class="mt-4 inline-block ui-link"> Navi </RouterLink>
    </div>
  </div>
</template>
