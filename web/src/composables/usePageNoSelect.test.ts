import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, Teleport } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PAGE_NO_SELECT_CLASS, isNoSelectRoute, usePageNoSelect } from './usePageNoSelect';

const Blank = { template: '<div />' };

const routes = [
  { path: '/', name: 'home', component: Blank },
  { path: '/login', name: 'login', component: Blank },
  { path: '/setup', name: 'setup', component: Blank },
  { path: '/change-password', name: 'change-password', component: Blank },
  { path: '/settings', name: 'settings-parent', component: Blank },
  { path: '/settings/engines', name: 'settings-engines', component: Blank },
  { path: '/settings/bookmarks', name: 'settings-bookmarks', component: Blank },
  { path: '/settings/tags', name: 'settings-tags', component: Blank },
  { path: '/settings/preferences', name: 'settings-preferences', component: Blank },
  { path: '/settings/slogan', name: 'settings-slogan', component: Blank },
  { path: '/settings/background', name: 'settings-background', component: Blank },
  { path: '/settings/music', name: 'settings-music', component: Blank },
  { path: '/settings/transfer', name: 'settings-transfer', component: Blank },
  { path: '/settings/account', name: 'settings-account', component: Blank },
  { path: '/settings/admin', name: 'settings-admin', component: Blank },
  { path: '/missing', name: 'not-found', component: Blank },
] as const;

function mountWithRoute() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...routes],
  });
  const Host = defineComponent({
    setup() {
      usePageNoSelect();
      return () => null;
    },
  });
  return { router, Host };
}

function styleSource(): string {
  return readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');
}

function hookSource(): string {
  return readFileSync(resolve(process.cwd(), 'web/src/composables/usePageNoSelect.ts'), 'utf8');
}

afterEach(() => {
  document.body.classList.remove(PAGE_NO_SELECT_CLASS);
});

describe('isNoSelectRoute', () => {
  it('enables the homepage and every settings-center route', () => {
    expect(isNoSelectRoute({ name: 'home', path: '/' })).toBe(true);
    const settingsNames = [
      'settings-engines',
      'settings-bookmarks',
      'settings-tags',
      'settings-preferences',
      'settings-slogan',
      'settings-background',
      'settings-music',
      'settings-transfer',
      'settings-account',
      'settings-admin',
    ];
    for (const name of settingsNames) {
      expect(isNoSelectRoute({ name, path: `/${name.replace('settings-', 'settings/')}` })).toBe(
        true,
      );
    }
    expect(isNoSelectRoute({ name: undefined, path: '/settings' })).toBe(true);
    expect(isNoSelectRoute({ name: undefined, path: '/settings/engines' })).toBe(true);
  });

  it('leaves login, setup, change-password and not-found selectable', () => {
    expect(isNoSelectRoute({ name: 'login', path: '/login' })).toBe(false);
    expect(isNoSelectRoute({ name: 'setup', path: '/setup' })).toBe(false);
    expect(isNoSelectRoute({ name: 'change-password', path: '/change-password' })).toBe(false);
    expect(isNoSelectRoute({ name: 'not-found', path: '/missing' })).toBe(false);
  });
});

describe('usePageNoSelect', () => {
  it('keeps the homepage body class and restores it after leaving and returning', async () => {
    const { router, Host } = mountWithRoute();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(Host, { global: { plugins: [router] } });

    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    await router.push('/login');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);

    await router.push('/');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    wrapper.unmount();
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);
  });

  it('enables the body class on admin settings routes and removes it when leaving', async () => {
    const { router, Host } = mountWithRoute();
    await router.push('/settings/engines');
    await router.isReady();
    const wrapper = mount(Host, { global: { plugins: [router] } });

    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    await router.push('/settings/bookmarks');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    await router.push('/settings/admin');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    await router.push('/login');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);

    await router.push('/setup');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);

    await router.push('/change-password');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);

    await router.push('/settings/transfer');
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    wrapper.unmount();
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);
  });

  it('covers Teleport-to-body overlays via the body class without pointerdown guards', async () => {
    const { router, Host } = mountWithRoute();
    await router.push('/settings/engines');
    await router.isReady();
    const hookWrapper = mount(Host, { global: { plugins: [router] } });
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    const Overlay = defineComponent({
      setup() {
        return () =>
          h(Teleport, { to: 'body' }, h('div', { class: 'fake-manage-modal' }, 'overlay'));
      },
    });
    const overlayWrapper = mount(Overlay);
    const overlay = document.body.querySelector('.fake-manage-modal');
    expect(overlay).not.toBeNull();
    expect(overlay?.parentElement).toBe(document.body);
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(true);

    // jsdom 不能验证实际的 user-select 视觉效果，这里只覆盖「浮层作为 body 子节点、与开关类同树」的结构约定。
    const source = hookSource();
    expect(source).not.toMatch(/getSelection\s*\(/);
    expect(source).not.toMatch(/removeAllRanges\s*\(/);
    expect(source).not.toMatch(/addEventListener\(\s*['"]pointerdown['"]/);
    expect(source).not.toMatch(/addEventListener\(\s*['"]selectstart['"]/);
    expect(source).not.toMatch(/preventDefault\s*\(/);

    overlayWrapper.unmount();
    hookWrapper.unmount();
    expect(document.body.classList.contains(PAGE_NO_SELECT_CLASS)).toBe(false);
  });

  it('guards document access when no DOM is available', () => {
    expect(hookSource()).toContain("typeof document !== 'undefined'");
  });

  it('defines page-wide CSS with editable-field exemptions in style.css', () => {
    const source = styleSource();
    expect(source).toContain('body.page-no-select');
    expect(source).toContain('body.page-no-select input');
    expect(source).toContain('body.page-no-select textarea');
    expect(source).toContain('body.page-no-select [contenteditable]');
    expect(source).toContain('user-select: none;');
    expect(source).toContain('user-select: text;');
    expect(source).not.toContain('body.home-no-select');
  });
});
