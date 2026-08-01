import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import BaseListbox, { type ListboxOption } from './BaseListbox.vue';

const OPTIONS: ListboxOption<string>[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana' },
  { value: 'cherry', label: 'Cherry', disabled: true },
  { value: 'date', label: 'Date' },
];

// 浮层 teleport 到 body：选项与 role=listbox 需从 document 查询，不在 wrapper 内。
function bodyOptions(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll('[role="option"]'));
}
function optionByText(text: string): HTMLElement | undefined {
  return bodyOptions().find((el) => el.textContent?.trim() === text);
}

function mountListbox(props: Record<string, unknown> = {}) {
  return mount(BaseListbox, {
    attachTo: document.body,
    props: { options: OPTIONS, modelValue: null, ...props },
  });
}

describe('BaseListbox', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a combobox trigger with the selected label', () => {
    const wrapper = mountListbox({ modelValue: 'banana' });
    const trigger = wrapper.get('[role="combobox"]');
    expect(trigger.text()).toContain('Banana');
    expect(trigger.attributes('aria-haspopup')).toBe('listbox');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('shows the placeholder when nothing is selected', () => {
    const wrapper = mountListbox({ placeholder: 'Pick one' });
    expect(wrapper.get('[role="combobox"]').text()).toContain('Pick one');
    wrapper.unmount();
  });

  it('opens on click and renders options with role=option', async () => {
    const wrapper = mountListbox();
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true');
    expect(bodyOptions()).toHaveLength(4);
    expect(document.body.querySelector('[role="listbox"]')).toBeTruthy();
    wrapper.unmount();
  });

  it('selects an option on click and emits update:modelValue + change', async () => {
    const wrapper = mountListbox();
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();

    optionByText('Banana')!.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['banana']);
    expect(wrapper.emitted('change')?.[0]).toEqual(['banana']);
    // 选定后关闭
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });

  it('does not select a disabled option', async () => {
    const wrapper = mountListbox();
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();

    optionByText('Cherry')!.click();
    await flushPromises();

    expect(wrapper.emitted('change')).toBeUndefined();
    wrapper.unmount();
  });

  it('marks the selected option with aria-selected', async () => {
    const wrapper = mountListbox({ modelValue: 'date' });
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();

    expect(optionByText('Date')!.getAttribute('aria-selected')).toBe('true');
    expect(optionByText('Apple')!.getAttribute('aria-selected')).toBe('false');
    wrapper.unmount();
  });

  describe('keyboard', () => {
    it('opens with ArrowDown and highlights the current selection', async () => {
      const wrapper = mountListbox({ modelValue: 'banana' });
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await flushPromises();

      expect(trigger.attributes('aria-expanded')).toBe('true');
      // activedescendant 指向当前选中项（banana，索引 1）。
      expect(trigger.attributes('aria-activedescendant')).toContain('opt-1');
      wrapper.unmount();
    });

    it('moves active with ArrowDown skipping disabled options and selects with Enter', async () => {
      const wrapper = mountListbox({ modelValue: 'apple' });
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' }); // 打开并停在当前选中项 apple(0)
      await trigger.trigger('keydown', { key: 'ArrowDown' }); // apple(0) → banana(1)
      await trigger.trigger('keydown', { key: 'ArrowDown' }); // banana(1) → date(3)，跳过 cherry(2, disabled)
      await trigger.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(wrapper.emitted('change')?.[0]).toEqual(['date']);
      wrapper.unmount();
    });

    it('does not wrap past the last option', async () => {
      const wrapper = mountListbox({ modelValue: 'date' }); // 末项
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' }); // 已在末项，停住
      await trigger.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(wrapper.emitted('change')?.[0]).toEqual(['date']);
      wrapper.unmount();
    });

    it('Home/End jump to first/last enabled option', async () => {
      const wrapper = mountListbox({ modelValue: 'banana' });
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' }); // 打开
      await trigger.trigger('keydown', { key: 'End' });
      await trigger.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(wrapper.emitted('change')?.[0]).toEqual(['date']);

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await trigger.trigger('keydown', { key: 'Home' });
      await trigger.trigger('keydown', { key: 'Enter' });
      await flushPromises();
      expect(wrapper.emitted('change')?.[1]).toEqual(['apple']);
      wrapper.unmount();
    });

    it('closes on Escape without selecting', async () => {
      const wrapper = mountListbox();
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' });
      await flushPromises();
      expect(trigger.attributes('aria-expanded')).toBe('true');

      await trigger.trigger('keydown', { key: 'Escape' });
      await flushPromises();
      expect(trigger.attributes('aria-expanded')).toBe('false');
      expect(wrapper.emitted('change')).toBeUndefined();
      wrapper.unmount();
    });

    it('typeahead jumps to the matching option', async () => {
      const wrapper = mountListbox();
      const trigger = wrapper.get('[role="combobox"]');

      await trigger.trigger('keydown', { key: 'ArrowDown' }); // 打开
      await trigger.trigger('keydown', { key: 'd' }); // 跳到 Date
      await trigger.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(wrapper.emitted('change')?.[0]).toEqual(['date']);
      wrapper.unmount();
    });
  });

  it('does not open when disabled', async () => {
    const wrapper = mountListbox({ disabled: true });
    await wrapper.get('[role="combobox"]').trigger('click');
    await flushPromises();
    // disabled 按钮点击不展开
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
