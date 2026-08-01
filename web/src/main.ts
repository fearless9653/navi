import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import { router } from './router';
import { i18n } from './i18n';
import { initTheme } from './composables/useTheme';
import { useAuthStore } from './stores/auth';

const app = createApp(App);
app.use(createPinia());
app.use(i18n);

initTheme();

// 先引导会话状态，再挂路由与应用，确保守卫能拿到 needsSetup/user。
const auth = useAuthStore();
void auth.bootstrap().finally(() => {
  app.use(router);
  app.mount('#app');
});
