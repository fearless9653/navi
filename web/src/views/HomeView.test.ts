import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import HomeView from './HomeView.vue';
import { useAuthStore } from '@/stores/auth';
import { useBookmarksStore } from '@/stores/bookmarks';
import { useEnginesStore } from '@/stores/engines';
import { useMusicStore } from '@/stores/music';
import { usePrefsStore } from '@/stores/prefs';
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

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders the music player on the home page for signed-in users', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    const bookmarks = useBookmarksStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
      musicPlaylist: JSON.stringify([{ name: 'Theme', url: 'https://example.com/theme.mp3' }]),
    };
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          WebSearchHero: { template: '<div />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div data-test="music-player" />' },
        },
      },
    });

    expect(wrapper.find('[data-test="music-player"]').exists()).toBe(true);
  });

  it('renders a custom slogan above the search area for signed-in users', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '今日宜专注。',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          HomeSlogan: {
            props: ['slogan'],
            template: '<p data-test="home-slogan">{{ slogan }}</p>',
          },
          WebSearchHero: { template: '<div data-test="web-search-hero" />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });

    expect(wrapper.find('[data-test="home-slogan"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="home-slogan"]').text()).toBe('今日宜专注。');
  });

  it('preserves leading/trailing spaces in the slogan (rendered as-is, not trimmed)', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    // 首尾各带空格：必须原样传给渲染器，不能被 trim 掉（用户靠空格排版）。
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '  今日宜专注。  ',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          HomeSlogan: {
            props: ['slogan'],
            template: '<p data-test="home-slogan">{{ slogan }}</p>',
          },
          WebSearchHero: { template: '<div data-test="web-search-hero" />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });

    expect(wrapper.find('[data-test="home-slogan"]').exists()).toBe(true);
    // 验证首尾空格未被 trim：jsdom 序列化会规范化空白但保留首尾各一个空格
    // （若 HomeView 仍 trim，序列化结果会紧贴标签，无空格）。
    const html = wrapper.find('[data-test="home-slogan"]').html();
    expect(html).toMatch(/>\s今日宜专注。\s<\/p>/);
  });

  it('treats a whitespace-only slogan as absent (not rendered)', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
      slogan: '   ',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          HomeSlogan: {
            props: ['slogan'],
            template: '<p data-test="home-slogan">{{ slogan }}</p>',
          },
          WebSearchHero: { template: '<div data-test="web-search-hero" />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });

    expect(wrapper.find('[data-test="home-slogan"]').exists()).toBe(false);
  });

  it('does not render a slogan by default for signed-in users', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          HomeSlogan: {
            props: ['slogan'],
            template: '<p data-test="home-slogan">{{ slogan }}</p>',
          },
          WebSearchHero: { template: '<div data-test="web-search-hero" />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });

    expect(wrapper.find('[data-test="home-slogan"]').exists()).toBe(false);
  });

  it('only shows the recent rail divider on desktop layouts', () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };

    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'weight',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          HomeSlogan: {
            props: ['slogan'],
            template: '<p data-test="home-slogan">{{ slogan }}</p>',
          },
          WebSearchHero: { template: '<div data-test="web-search-hero" />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });

    const recentRailWrap = wrapper.find('aside');

    expect(recentRailWrap.classes()).not.toContain('border-r');
    expect(recentRailWrap.classes()).toEqual(expect.arrayContaining(['lg:border-r', 'lg:pr-6']));
  });

  it('gives the guest and signed-in search bars the same vertical offset', async () => {
    // 登录前后搜索框位置须基本一致：两态包裹层的下压类（pt）相同，
    // 且游客态用 slogan 占位行补齐登录态标语所占的一行高度。
    function mountAt(authed: boolean) {
      const auth = useAuthStore();
      auth.user = authed
        ? {
            id: 1,
            email: 'user@example.com',
            displayName: 'User',
            isAdmin: false,
            isActive: true,
            mustChangePassword: false,
            createdDate: '2026-01-01T00:00:00.000Z',
            lastModifiedDate: '2026-01-01T00:00:00.000Z',
          }
        : null;

      const engines = useEnginesStore();
      const tags = useTagsStore();
      const prefs = usePrefsStore();
      const bookmarks = useBookmarksStore();
      // 无标语（游客永远无偏好），两态都应渲染占位行。
      prefs.prefs = authed
        ? { defaultSort: 'weight', recentCount: 10, pageSize: 24, backgroundType: 'none' }
        : null;
      vi.spyOn(engines, 'load').mockResolvedValue();
      vi.spyOn(tags, 'loadAll').mockResolvedValue();
      vi.spyOn(prefs, 'load').mockResolvedValue();
      vi.spyOn(bookmarks, 'load').mockResolvedValue();
      vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
      vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

      return mount(HomeView, {
        global: {
          stubs: {
            AppLayout: { template: '<div><slot /></div>' },
            WebSearchHero: { template: '<div data-test="web-search-hero" />' },
            HomeRails: { template: '<div />' },
            TagCascadePopover: { template: '<div />' },
            TagChips: { template: '<div />' },
            BookmarkGrid: { template: '<div />' },
            Pagination: { template: '<div />' },
            BookmarkEditModal: { template: '<div />' },
            MusicPlayer: { template: '<div />' },
          },
        },
      });
    }

    // 下压类取自搜索框的父元素（即包裹层），两态必须一致。
    function offsetClassesOf(wrapper: ReturnType<typeof mountAt>): string[] {
      const hero = wrapper.find('[data-test="web-search-hero"]');
      expect(hero.exists()).toBe(true);
      return (hero.element.parentElement?.className ?? '')
        .split(/\s+/)
        .filter((c) => c.startsWith('pt-') || c.startsWith('md:pt-') || c === 'gap-6')
        .sort();
    }

    const guest = mountAt(false);
    await flushPromises();
    const guestClasses = offsetClassesOf(guest);
    const guestHasPlaceholder = guest.find('[data-test="home-slogan-placeholder"]').exists();
    guest.unmount();

    setActivePinia(createPinia());

    const authed = mountAt(true);
    await flushPromises();
    const authedClasses = offsetClassesOf(authed);
    const authedHasPlaceholder = authed.find('[data-test="home-slogan-placeholder"]').exists();
    authed.unmount();

    expect(guestClasses).toEqual(authedClasses);
    expect(guestClasses).toEqual(
      expect.arrayContaining(['pt-8', 'md:pt-[clamp(1.5rem,18vh,14rem)]']),
    );
    // 两态都补齐标语行，故搜索框上方留白相同。
    expect(guestHasPlaceholder).toBe(true);
    expect(authedHasPlaceholder).toBe(true);
  });

  it('keeps the header height stable across auth states', () => {
    // header 高度由 nav 内容撑起：游客是登录链接、登录态是账号菜单（更高）。
    // 若不锁定 min-height，登录前后 header 差 4px，会连带把整页内容上下推移。
    const source = readFileSync(resolve(process.cwd(), 'web/src/layouts/AppLayout.vue'), 'utf8');

    expect(source).toContain('min-h-9');
  });

  it('positions the add button with the shared mobile-safe floating offset', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/views/HomeView.vue'), 'utf8');

    expect(source).toContain('home-add-button');
    expect(source).toContain('bottom: var(--home-floating-control-bottom);');
    expect(source).not.toContain('fixed bottom-6 right-6');
  });

  it('seeds the sort selector from the default-sort preference and switches without persisting', async () => {
    const auth = useAuthStore();
    auth.user = {
      id: 1,
      email: 'user@example.com',
      displayName: 'User',
      isAdmin: false,
      isActive: true,
      mustChangePassword: false,
      createdDate: '2026-01-01T00:00:00.000Z',
      lastModifiedDate: '2026-01-01T00:00:00.000Z',
    };
    const engines = useEnginesStore();
    const tags = useTagsStore();
    const prefs = usePrefsStore();
    prefs.prefs = {
      defaultSort: 'visits',
      recentCount: 10,
      pageSize: 24,
      backgroundType: 'none',
    };
    const bookmarks = useBookmarksStore();
    vi.spyOn(engines, 'load').mockResolvedValue();
    vi.spyOn(tags, 'loadAll').mockResolvedValue();
    vi.spyOn(prefs, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'load').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
    vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();
    const setSort = vi.spyOn(bookmarks, 'setSort');
    const updatePrefs = vi.spyOn(prefs, 'update').mockResolvedValue();
    // 筛选/排序栏仅在有结果（或有筛选）时渲染；置 total 让其可见。
    bookmarks.total = 1;

    const wrapper = mount(HomeView, {
      global: {
        stubs: {
          AppLayout: { template: '<div><slot /></div>' },
          WebSearchHero: { template: '<div />' },
          HomeRails: { template: '<div />' },
          TagCascadePopover: { template: '<div />' },
          TagChips: { template: '<div />' },
          BookmarkGrid: { template: '<div />' },
          Pagination: { template: '<div />' },
          BookmarkEditModal: { template: '<div />' },
          MusicPlayer: { template: '<div />' },
        },
      },
    });
    await flushPromises();

    const trigger = wrapper.find('#home-sort-select');
    // 初始值取自默认排序偏好（visits）；触发器标签为 sort.visits 的译文（此处 t 直出 key）
    expect(trigger.text()).toContain('sort.visits');

    // 打开浮层，选项 teleport 到 body，按标签找到「name」项并点选
    await trigger.trigger('click');
    await flushPromises();
    const opts = Array.from(document.body.querySelectorAll('[role="option"]'));
    const nameOpt = opts.find((el) => el.textContent?.trim() === 'sort.name');
    expect(nameOpt).toBeTruthy();
    (nameOpt as HTMLElement).click();
    await flushPromises();

    expect(setSort).toHaveBeenCalledWith('name');
    // 仅当前会话切换，不写回偏好
    expect(updatePrefs).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  describe('keyboard shortcuts', () => {
    function mountAuthedHome() {
      const auth = useAuthStore();
      auth.user = {
        id: 1,
        email: 'user@example.com',
        displayName: 'User',
        isAdmin: false,
        isActive: true,
        mustChangePassword: false,
        createdDate: '2026-01-01T00:00:00.000Z',
        lastModifiedDate: '2026-01-01T00:00:00.000Z',
      };
      const engines = useEnginesStore();
      const tags = useTagsStore();
      const prefs = usePrefsStore();
      const bookmarks = useBookmarksStore();
      prefs.prefs = {
        defaultSort: 'weight',
        recentCount: 10,
        pageSize: 24,
        backgroundType: 'none',
      };
      vi.spyOn(engines, 'load').mockResolvedValue();
      vi.spyOn(tags, 'loadAll').mockResolvedValue();
      vi.spyOn(prefs, 'load').mockResolvedValue();
      vi.spyOn(bookmarks, 'load').mockResolvedValue();
      vi.spyOn(bookmarks, 'loadRecent').mockResolvedValue();
      vi.spyOn(bookmarks, 'loadTops').mockResolvedValue();

      return mount(HomeView, {
        attachTo: document.body,
        global: {
          stubs: {
            AppLayout: { template: '<div><slot /></div>' },
            WebSearchHero: {
              template: '<div data-test="web-search-hero" />',
              methods: { focusInput: vi.fn() },
            },
            HomeRails: { template: '<div />' },
            TagCascadePopover: { template: '<div />' },
            TagChips: { template: '<div />' },
            BookmarkGrid: { template: '<div />' },
            Pagination: { template: '<div />' },
            BookmarkEditModal: { template: '<div data-test="edit-modal" />' },
            ShortcutHelpModal: { template: '<div data-test="help-modal" />' },
            MusicPlayer: { template: '<div />' },
          },
        },
      });
    }

    function press(key: string, init: KeyboardEventInit = {}): void {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...init }),
      );
    }

    it('opens the add-bookmark modal with N', async () => {
      const wrapper = mountAuthedHome();

      press('n');
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-test="edit-modal"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('opens the shortcut help with ?', async () => {
      const wrapper = mountAuthedHome();

      press('?', { shiftKey: true });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-test="help-modal"]').exists()).toBe(true);
      wrapper.unmount();
    });

    it('does not open the modal while typing in an input', async () => {
      const wrapper = mountAuthedHome();
      const input = wrapper.find('input[type="search"]');

      await input.trigger('keydown', { key: 'n' });
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-test="edit-modal"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('toggles music playback with P when a playlist exists', async () => {
      const wrapper = mountAuthedHome();
      const music = useMusicStore();
      music.playlist = [{ name: 'Theme', url: 'https://example.com/theme.mp3' }];
      const toggle = vi.spyOn(music, 'toggle').mockImplementation(() => {});

      press('p');
      await wrapper.vm.$nextTick();

      expect(toggle).toHaveBeenCalledTimes(1);
      wrapper.unmount();
    });

    it('does not toggle music with P when the playlist is empty', async () => {
      const wrapper = mountAuthedHome();
      const music = useMusicStore();
      const toggle = vi.spyOn(music, 'toggle').mockImplementation(() => {});

      press('p');
      await wrapper.vm.$nextTick();

      expect(toggle).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it('declares aria-keyshortcuts on the floating add button', () => {
      const wrapper = mountAuthedHome();

      const fab = wrapper.find('button.home-add-button');
      expect(fab.attributes('aria-keyshortcuts')).toBe('n');
      wrapper.unmount();
    });
  });
});
