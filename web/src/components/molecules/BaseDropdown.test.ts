import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import BaseDropdown from './BaseDropdown.vue';
import BaseModal from './BaseModal.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function menu(): HTMLElement | null {
  return document.body.querySelector('.dropdown-menu');
}
function scrim(): HTMLElement | null {
  return document.body.querySelector('[data-test="dropdown-scrim"]');
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('BaseDropdown 浮层级', () => {
  it('页面级下拉使用 --z-dropdown', async () => {
    const wrapper = mount(
      defineComponent({
        components: { BaseDropdown },
        template: `
          <BaseDropdown>
            <template #trigger="{ toggle }">
              <button data-test="trigger" type="button" @click="toggle">打开</button>
            </template>
            <div>选项</div>
          </BaseDropdown>
        `,
      }),
      { attachTo: document.body },
    );

    await wrapper.get('[data-test="trigger"]').trigger('click');
    await flushPromises();
    await nextTick();

    expect(menu()?.style.zIndex).toBe('calc(var(--z-dropdown) + 1)');
    expect(scrim()?.style.zIndex).toBe('var(--z-dropdown)');
    wrapper.unmount();
  });

  it('弹窗内下拉改用 --z-popover，避免被遮罩挡住', async () => {
    const wrapper = mount(
      defineComponent({
        components: { BaseDropdown, BaseModal },
        template: `
          <BaseModal title="编辑引擎">
            <BaseDropdown>
              <template #trigger="{ toggle }">
                <button data-test="trigger" type="button" @click="toggle">打开</button>
              </template>
              <div>无</div>
            </BaseDropdown>
          </BaseModal>
        `,
      }),
      {
        attachTo: document.body,
        global: { stubs: { BaseButton: true } },
      },
    );

    await flushPromises();
    await nextTick();
    expect(document.body.querySelector('.modal-overlay')).not.toBeNull();

    // 弹窗 Teleport 到 body，不能用 wrapper.get 找触发器。
    const trigger = document.body.querySelector<HTMLElement>('[data-test="trigger"]');
    expect(trigger).not.toBeNull();
    trigger!.click();
    await flushPromises();
    await nextTick();

    expect(menu()?.style.zIndex).toBe('calc(var(--z-popover) + 1)');
    expect(scrim()?.style.zIndex).toBe('var(--z-popover)');
    wrapper.unmount();
  });
});
