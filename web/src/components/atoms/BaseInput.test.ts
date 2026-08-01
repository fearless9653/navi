import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import BaseInput from './BaseInput.vue';
import BaseBadge from './BaseBadge.vue';
import BaseCheckbox from './BaseCheckbox.vue';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('BaseInput', () => {
  it('updates v-model on input', async () => {
    const w = mount(BaseInput, { props: { modelValue: '' } });
    await w.find('input').setValue('hello');
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['hello']);
  });

  it('associates label with input via id', () => {
    const w = mount(BaseInput, { props: { label: 'Name' } });
    const id = w.find('input').attributes('id');
    expect(w.find('label').attributes('for')).toBe(id);
  });

  it('exposes error with aria-invalid + role=alert', () => {
    const w = mount(BaseInput, { props: { error: 'Required' } });
    expect(w.find('input').attributes('aria-invalid')).toBe('true');
    const alert = w.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toBe('Required');
  });

  it('renders append slot', () => {
    const w = mount(BaseInput, { slots: { append: '<button class="x">go</button>' } });
    expect(w.find('button.x').exists()).toBe(true);
  });
});

describe('BaseBadge', () => {
  it('applies variant and size classes', () => {
    const w = mount(BaseBadge, {
      props: { variant: 'primary', size: 'xs' },
      slots: { default: 'tag' },
    });
    expect(w.classes()).toContain('badge-primary');
    expect(w.classes()).toContain('badge-xs');
    expect(w.text()).toBe('tag');
  });

  it('keeps xs badge text visually centered in a stable pill height', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'web/src/components/atoms/BaseBadge.vue'),
      'utf8',
    );

    expect(source).toContain('justify-content: center;');
    expect(source).toContain('height: 1rem;');
    expect(source).toContain('line-height: 1rem;');
    expect(source).toContain('padding-block: 0;');
  });
});

describe('BaseCheckbox', () => {
  it('toggles v-model', async () => {
    const w = mount(BaseCheckbox, { props: { modelValue: false } });
    await w.find('input').setValue(true);
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([true]);
  });
});
