import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import BaseModal from './BaseModal.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

function mountModal() {
  return mount(BaseModal, {
    attachTo: document.body,
    props: { title: '新建网址' },
    slots: { default: '<input data-test="modal-field" />' },
    global: { stubs: { BaseButton: true } },
  });
}

describe('BaseModal 遮罩关闭', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('在遮罩上按下并松开时关闭', async () => {
    const wrapper = mountModal();
    const overlay = document.body.querySelector('[data-test="modal-overlay"]');
    expect(overlay).not.toBeNull();

    overlay!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    overlay!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('close')).toBeTruthy();
    wrapper.unmount();
  });

  it('在输入框按下、拖到遮罩上松开时不关闭', async () => {
    const wrapper = mountModal();
    const overlay = document.body.querySelector('[data-test="modal-overlay"]');
    const field = document.body.querySelector('[data-test="modal-field"]');
    expect(overlay).not.toBeNull();
    expect(field).not.toBeNull();

    field!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    overlay!.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('close')).toBeFalsy();
    wrapper.unmount();
  });
});
