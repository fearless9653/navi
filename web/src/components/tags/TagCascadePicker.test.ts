import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TagCascadePicker from './TagCascadePicker.vue';
import { useTagsStore } from '@/stores/tags';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

describe('TagCascadePicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('can disable search and loads all tags once on mount', async () => {
    const tags = useTagsStore();
    const loadAll = vi.spyOn(tags, 'loadAll').mockResolvedValue();

    const wrapper = mount(TagCascadePicker, {
      props: {
        searchable: false,
      },
    });

    await Promise.resolve();

    expect(wrapper.find('input').exists()).toBe(false);
    expect(loadAll).toHaveBeenCalledOnce();
  });
});
