import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BaseButton from './BaseButton.vue';

describe('BaseButton', () => {
  it('renders slot content', () => {
    const w = mount(BaseButton, { slots: { default: 'Save' } });
    expect(w.text()).toContain('Save');
  });

  it('applies variant and size classes', () => {
    const w = mount(BaseButton, { props: { variant: 'danger', size: 'lg' } });
    expect(w.classes()).toContain('btn-danger');
    expect(w.classes()).toContain('btn-lg');
  });

  it('defaults to primary/md and type=button', () => {
    const w = mount(BaseButton);
    expect(w.classes()).toContain('btn-primary');
    expect(w.classes()).toContain('btn-md');
    expect(w.attributes('type')).toBe('button');
  });

  it('emits click', async () => {
    const w = mount(BaseButton);
    await w.trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });

  it('is disabled and shows spinner + aria-busy when loading', () => {
    const w = mount(BaseButton, { props: { loading: true } });
    expect(w.attributes('disabled')).toBeDefined();
    expect(w.attributes('aria-busy')).toBe('true');
    expect(w.find('.btn-spinner').exists()).toBe(true);
  });

  it('is disabled when disabled prop set', () => {
    const w = mount(BaseButton, { props: { disabled: true } });
    expect(w.attributes('disabled')).toBeDefined();
  });
});
