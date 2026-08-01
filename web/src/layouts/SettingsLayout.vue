<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { useI18n } from 'vue-i18n';
import AppLayout from './AppLayout.vue';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const auth = useAuthStore();

interface NavItem {
  to: string;
  label: string;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}

const groups = computed<NavGroup[]>(() => [
  {
    label: t('settings.groupContent'),
    items: [
      { to: 'settings-engines', label: t('admin.engines') },
      { to: 'settings-bookmarks', label: t('nav.manage') },
      { to: 'settings-tags', label: t('admin.tags') },
    ],
  },
  {
    label: t('settings.groupPrefs'),
    items: [
      { to: 'settings-preferences', label: t('settings.display') },
      { to: 'settings-slogan', label: t('settings.sloganSection') },
      { to: 'settings-background', label: t('settings.backgroundSection') },
      { to: 'settings-music', label: t('settings.music') },
    ],
  },
  {
    label: t('settings.groupAccount'),
    items: [
      { to: 'settings-transfer', label: t('settings.transfer') },
      { to: 'settings-account', label: t('settings.password') },
    ],
  },
  ...(auth.isAdmin
    ? [
        {
          label: t('settings.groupAdmin'),
          items: [{ to: 'settings-admin', label: t('admin.users') }],
        },
      ]
    : []),
]);
</script>

<template>
  <AppLayout>
    <div class="flex flex-1 flex-col gap-4 md:flex-row">
      <aside
        data-test="settings-nav-surface"
        class="self-start shrink-0 rounded-lg p-3 ui-surface-translucent shadow-sm md:w-52 md:p-4"
      >
        <nav class="flex flex-row flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-y-4">
          <div v-for="g in groups" :key="g.label">
            <p class="mb-1 ui-nav-group-title">
              {{ g.label }}
            </p>
            <ul class="space-y-0.5">
              <li v-for="item in g.items" :key="item.to">
                <RouterLink
                  :to="{ name: item.to }"
                  class="block rounded-md px-2 py-1.5 text-sm ui-button-ghost"
                  active-class="ui-active font-medium"
                >
                  {{ item.label }}
                </RouterLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
      <section class="flex min-w-0 flex-1 flex-col">
        <!-- 分区不加过渡：分区组件多为多根（内容 + 平级弹窗），out-in 要求单根，
             多根会使 leave 钩子无法完成、切换永久卡死。页面级跳变已由 App.vue
             顶层 route-fade 覆盖，分区间切换本就轻量，不再叠一层。 -->
        <RouterView />
      </section>
    </div>
  </AppLayout>
</template>
