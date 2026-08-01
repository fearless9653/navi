import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import Pagination from './Pagination.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('Pagination', () => {
  it('renders the pagination controls inside a stable root surface', () => {
    const wrapper = mount(Pagination, { props: { current: 2, total: 4 } });

    const pagination = wrapper.find('.pagination');
    expect(pagination.exists()).toBe(true);
    expect(pagination.findAll('.pagination-page')).toHaveLength(4);
  });

  it('uses a translucent surface so page controls remain readable over wallpapers', () => {
    const source = readFileSync('web/src/components/molecules/Pagination.vue', 'utf-8');

    expect(source).toContain('width: fit-content;');
    expect(source).toContain('backdrop-filter: var(--glass-backdrop);');
    expect(source).toContain('-webkit-backdrop-filter: var(--glass-backdrop);');
    expect(source).toContain('color-mix(in srgb, var(--color-surface) 72%, transparent)');
    expect(source).toContain('box-shadow: var(--shadow-sm);');
  });
});
