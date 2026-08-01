<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { setLocale, type Locale } from '@/i18n';
import { useTheme, type Theme } from '@/composables/useTheme';
import { BaseDropdown } from '@/components/molecules';

const { t, locale } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const { theme, setTheme } = useTheme();

function go(name: string): void {
  void router.push({ name });
}
// 登出/全端登出会通过 auth store 触发 resetDataStores（含 music.reset 释放音频），此处无需再单独 dispose。
async function logout(): Promise<void> {
  await auth.logout();
  void router.push({ name: 'login' });
}
async function logoutAll(): Promise<void> {
  await auth.logoutAll();
  void router.push({ name: 'login' });
}
function changeLocale(newLocale: Locale): void {
  setLocale(newLocale);
}
function changeTheme(newTheme: Theme): void {
  setTheme(newTheme);
}
</script>

<template>
  <BaseDropdown align="right">
    <template #trigger="{ toggle }">
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-sm ui-button-ghost"
        @click="toggle"
      >
        <span
          class="grid h-6 w-6 place-items-center rounded-full text-xs font-medium text-[var(--color-on-accent)]"
          :style="{ backgroundColor: 'var(--color-accent)' }"
        >
          {{ (auth.user?.displayName ?? '?').slice(0, 1).toUpperCase() }}
        </span>
        <span class="max-w-32 truncate">{{ auth.user?.displayName }}</span>
      </button>
    </template>

    <template #default="{ close }">
      <div class="w-56 text-sm">
        <div class="border-b ui-divider px-3 py-2">
          <div class="truncate font-medium">{{ auth.user?.displayName }}</div>
          <div class="truncate text-xs ui-text-faint">{{ auth.user?.email }}</div>
        </div>

        <!-- 语言切换 -->
        <div class="border-b ui-divider px-3 py-2">
          <div class="mb-1.5 text-xs ui-text-faint">{{ t('locale.language') }}</div>
          <div class="flex gap-2">
            <button
              class="grid flex-1 place-items-center rounded py-1.5 transition-colors"
              :class="
                locale === 'zh'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'ui-button-ghost'
              "
              :title="'中文'"
              @click="changeLocale('zh')"
            >
              <span class="text-sm font-medium">中</span>
            </button>
            <button
              class="grid flex-1 place-items-center rounded py-1.5 transition-colors"
              :class="
                locale === 'en'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'ui-button-ghost'
              "
              :title="'English'"
              @click="changeLocale('en')"
            >
              <span class="text-sm font-medium">EN</span>
            </button>
          </div>
        </div>

        <!-- 主题切换 -->
        <div class="border-b ui-divider px-3 py-2">
          <div class="mb-1.5 text-xs ui-text-faint">{{ t('theme.title') }}</div>
          <div class="flex gap-2">
            <button
              class="grid flex-1 place-items-center rounded py-1.5 transition-colors"
              :class="
                theme === 'system'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'ui-button-ghost'
              "
              :title="t('theme.system')"
              @click="changeTheme('system')"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="4" width="18" height="12" rx="1" />
                <path d="M8 20h8M12 16v4" />
              </svg>
            </button>
            <button
              class="grid flex-1 place-items-center rounded py-1.5 transition-colors"
              :class="
                theme === 'light'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'ui-button-ghost'
              "
              :title="t('theme.light')"
              @click="changeTheme('light')"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
                />
              </svg>
            </button>
            <button
              class="grid flex-1 place-items-center rounded py-1.5 transition-colors"
              :class="
                theme === 'dark'
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                  : 'ui-button-ghost'
              "
              :title="t('theme.dark')"
              @click="changeTheme('dark')"
            >
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </div>
        </div>

        <button
          class="block w-full px-3 py-2 text-left ui-row-hover"
          @click="
            go('settings-engines');
            close();
          "
        >
          {{ t('nav.settings') }}
        </button>
        <div class="border-t ui-divider" />
        <div class="flex">
          <button
            class="flex-1 px-3 py-2 text-center text-[var(--color-danger)] ui-row-hover"
            @click="
              logout();
              close();
            "
          >
            {{ t('nav.logout') }}
          </button>
          <div class="w-px self-stretch ui-divider" />
          <button
            class="flex-1 px-3 py-2 text-center text-[var(--color-danger)] ui-row-hover"
            @click="
              logoutAll();
              close();
            "
          >
            {{ t('nav.logoutAll') }}
          </button>
        </div>
      </div>
    </template>
  </BaseDropdown>
</template>
