import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BookmarksSection from './BookmarksSection.vue';
import { useBookmarksStore } from '@/stores/bookmarks';
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

describe('BookmarksSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('does not fetch all tags when the page mounts', async () => {
    const bookmarks = useBookmarksStore();
    const tags = useTagsStore();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    const loadAllTags = vi.spyOn(tags, 'load').mockResolvedValue();

    mount(BookmarksSection, {
      global: {
        stubs: {
          ListToolbar: { template: '<div />' },
          Pagination: { template: '<div />' },
          SortSelector: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          Favicon: { template: '<div />' },
          BaseButton: { template: '<button><slot /></button>' },
          BaseBadge: { template: '<div><slot /></div>' },
          BaseDropdown: { template: '<div><slot name="trigger" /><slot /></div>' },
          BaseCheckbox: { template: '<input type="checkbox" />' },
          TagCascadePopover: { template: '<div data-test="cascade-selector" />' },
        },
      },
    });

    await Promise.resolve();

    expect(loadAllTags).not.toHaveBeenCalled();
  });

  it('loads all bookmark statuses when the page mounts', async () => {
    const bookmarks = useBookmarksStore();
    const load = vi.spyOn(bookmarks, 'load').mockResolvedValue();

    mount(BookmarksSection, {
      global: {
        stubs: {
          ListToolbar: { template: '<div />' },
          Pagination: { template: '<div />' },
          SortSelector: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          Favicon: { template: '<div />' },
          BaseButton: { template: '<button><slot /></button>' },
          BaseBadge: { template: '<div><slot /></div>' },
          BaseCheckbox: { template: '<input type="checkbox" />' },
          BaseSelect: { template: '<select />' },
          TagCascadePopover: { template: '<div data-test="cascade-selector" />' },
        },
      },
    });

    await Promise.resolve();

    expect(load).toHaveBeenCalledWith({ status: 'all' });
  });
});
