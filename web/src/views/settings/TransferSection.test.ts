import { describe, expect, it, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import TransferSection from './TransferSection.vue';
import { api, ApiException } from '@/api/client';

vi.mock('vue-i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => key,
    }),
  };
});

// 仅 mock api 的方法，保留真实 ApiException（组件用 instanceof 判定密码错误）。
vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
  };
});

const mockedPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
});

/** 选择一个内容为 content 的文件并等待异步识别完成。 */
async function selectFile(content: string, name: string): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(TransferSection);
  const input = wrapper.find('input[type="file"]');
  const file = new File([content], name, { type: 'text/plain' });
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
  await input.trigger('change');
  // file.text() 是异步的，等微任务清空后再刷新渲染
  await new Promise((r) => setTimeout(r, 0));
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('TransferSection', () => {
  it('renders import and export settings on a translucent glass surface', () => {
    const wrapper = mount(TransferSection);

    const surface = wrapper.find('[data-test="transfer-surface"]');

    expect(surface.exists()).toBe(true);
    expect(surface.classes()).toContain('ui-surface-translucent');
  });

  it('renders both export buttons (JSON backup and browser bookmarks HTML)', () => {
    const wrapper = mount(TransferSection);

    expect(wrapper.find('[data-test="export-json"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="export-html"]').exists()).toBe(true);
  });

  it('detects a private JSON backup by content and shows the format', async () => {
    const wrapper = await selectFile('{"version":1,"bookmarks":[]}', 'backup.txt');

    expect(wrapper.find('[data-test="detected-format"]').text()).toBe('settings.detectedJson');
  });

  it('detects browser bookmarks HTML by content regardless of extension', async () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Tools</H3>
  <DL><p><DT><A HREF="https://example.com/">Example</A></DL><p>
</DL><p>`;
    const wrapper = await selectFile(html, 'bookmarks.txt');

    expect(wrapper.find('[data-test="detected-format"]').text()).toBe('settings.detectedHtml');
  });

  it('shows an unrecognized-format message for plain text', async () => {
    const wrapper = await selectFile('just some text', 'notes.txt');

    expect(wrapper.find('[data-test="detected-format"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('settings.unrecognizedFile');
  });

  describe('密码二次确认', () => {
    /** 输入密码并提交 teleport 到 body 的确认弹窗。 */
    async function submitPassword(password: string): Promise<void> {
      const input = document.body.querySelector<HTMLInputElement>('input[type="password"]');
      if (!input) throw new Error('密码弹窗未打开');
      input.value = password;
      input.dispatchEvent(new Event('input'));
      const form = input.closest('form')!;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    }

    it('导出前先弹密码确认，而非直接请求', async () => {
      const wrapper = mount(TransferSection, { attachTo: document.body });
      await wrapper.find('[data-test="export-json"]').trigger('click');
      await wrapper.vm.$nextTick();

      // 未输密码前不应发起导出请求，且弹窗已出现。
      expect(mockedPost).not.toHaveBeenCalled();
      expect(document.body.querySelector('input[type="password"]')).not.toBeNull();
      wrapper.unmount();
    });

    it('校验通过后带密码请求 /export', async () => {
      mockedPost.mockResolvedValue({ bookmarks: [] });
      const wrapper = mount(TransferSection, { attachTo: document.body });
      await wrapper.find('[data-test="export-json"]').trigger('click');
      await wrapper.vm.$nextTick();
      await submitPassword('secret123');

      expect(mockedPost).toHaveBeenCalledWith('/export', { password: 'secret123' });
      wrapper.unmount();
    });

    it('密码错误时弹窗内提示且不关闭', async () => {
      mockedPost.mockRejectedValue(new ApiException(400, { error: 'wrong_password' }));
      const wrapper = mount(TransferSection, { attachTo: document.body });
      await wrapper.find('[data-test="export-json"]').trigger('click');
      await wrapper.vm.$nextTick();
      await submitPassword('bad');
      await wrapper.vm.$nextTick();

      // 弹窗仍在，且显示密码错误文案。
      expect(document.body.querySelector('input[type="password"]')).not.toBeNull();
      expect(document.body.textContent).toContain('auth.wrongPassword');
      wrapper.unmount();
    });

    it('导入前先弹密码确认，通过后带密码请求 /import', async () => {
      mockedPost.mockResolvedValue({ tagsCreated: 0, bookmarksCreated: 1, bookmarksSkipped: 0 });
      const wrapper = await selectFile('{"version":1,"bookmarks":[]}', 'backup.txt');
      // 点击导入按钮（唯一文案为 settings.import 的按钮）打开弹窗。
      const importBtn = wrapper.findAll('button').find((b) => b.text() === 'settings.import')!;
      await importBtn.trigger('click');
      await wrapper.vm.$nextTick();
      await submitPassword('secret123');

      expect(mockedPost).toHaveBeenCalledWith('/import', {
        password: 'secret123',
        mode: 'merge',
        data: { version: 1, bookmarks: [] },
      });
      wrapper.unmount();
    });
  });
});
