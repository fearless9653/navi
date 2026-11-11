import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOME_NO_SELECT_CLASS, useHomeNoSelect } from './useHomeNoSelect';

const Blank = { template: '<div />' };

function mountWithRoute() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Blank },
      { path: '/settings/engines', name: 'settings-engines', component: Blank },
    ],
  });
  const Host = defineComponent({
    setup() {
      useHomeNoSelect();
      return () => null;
    },
  });
  return { router, Host };
}

afterEach(() => {
  document.body.classList.remove(HOME_NO_SELECT_CLASS);
});

describe('useHomeNoSelect', () => {
  it('adds the body class on the home route and removes it elsewhere', async () => {
    const { router, Host } = mountWithRoute();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(Host, { global: { plugins: [router] } });

    expect(document.body.classList.contains(HOME_NO_SELECT_CLASS)).toBe(true);

    await router.push('/settings/engines');
    expect(document.body.classList.contains(HOME_NO_SELECT_CLASS)).toBe(false);

    await router.push('/');
    expect(document.body.classList.contains(HOME_NO_SELECT_CLASS)).toBe(true);

    wrapper.unmount();
    expect(document.body.classList.contains(HOME_NO_SELECT_CLASS)).toBe(false);
  });

  it('defines the homepage-wide CSS exception for text fields in style.css', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');
    expect(source).toContain('body.home-no-select');
    expect(source).toContain('body.home-no-select input');
    expect(source).toContain('body.home-no-select textarea');
    expect(source).toContain('user-select: none;');
    expect(source).toContain('user-select: text;');
  });
});
