import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BookmarkEditModal from './BookmarkEditModal.vue';
import { useTagsStore } from '@/stores/tags';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({ t: (key: string) => key }),
  };
});

describe('BookmarkEditModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('新建网址时权重输入框默认为 100', () => {
    vi.spyOn(useTagsStore(), 'loadAll').mockResolvedValue();

    const wrapper = mount(BookmarkEditModal, {
      props: { bookmark: null },
      global: {
        stubs: {
          BaseModal: { template: '<form><slot /></form>' },
          BaseTextarea: { template: '<textarea />' },
          BaseButton: { template: '<button><slot /></button>' },
          BaseCheckbox: { template: '<input type="checkbox" />' },
          Favicon: { template: '<span />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
        },
      },
    });

    const weightInput = wrapper.get('input[type="number"]').element as HTMLInputElement;
    expect(weightInput.value).toBe('100');
  });
});
