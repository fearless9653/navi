import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useGridNavigation } from './useGridNavigation';

/**
 * jsdom 无布局引擎：getComputedStyle 只回读 inline style，
 * 因此测试里显式给网格元素设 grid-template-columns 来模拟不同断点的列数。
 */
function buildGrid(count: number, cols: number): HTMLElement {
  const container = document.createElement('div');
  const grid = document.createElement('div');
  grid.setAttribute('data-bm-grid', '');
  grid.style.gridTemplateColumns = Array(cols).fill('1fr').join(' ');
  for (let i = 0; i < count; i++) {
    const btn = document.createElement('button');
    btn.setAttribute('data-bm-card', '');
    btn.textContent = String(i);
    grid.appendChild(btn);
  }
  container.appendChild(grid);
  document.body.appendChild(container);
  return container;
}

function cardButtons(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-bm-card]'));
}

/** 当前聚焦卡片的下标（文本即下标），-1 表示焦点不在任何卡片上。 */
function focusedIndex(container: HTMLElement): number {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return -1;
  return cardButtons(container).indexOf(active);
}

let container: HTMLElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  document.body.innerHTML = '';
});

describe('useGridNavigation', () => {
  describe('focusFirst', () => {
    it('focuses the first card', () => {
      container = buildGrid(6, 3);
      const nav = useGridNavigation(ref(container));
      nav.focusFirst();
      expect(focusedIndex(container)).toBe(0);
    });

    it('is a no-op when there are no cards', () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      const nav = useGridNavigation(ref(container));
      expect(() => nav.focusFirst()).not.toThrow();
      expect(focusedIndex(container)).toBe(-1);
    });
  });

  describe('columnCount', () => {
    it('reads column count from grid-template-columns', () => {
      container = buildGrid(6, 4);
      const nav = useGridNavigation(ref(container));
      expect(nav.columnCount()).toBe(4);
    });

    it('degrades to 1 when the grid element is missing', () => {
      container = document.createElement('div');
      document.body.appendChild(container);
      const nav = useGridNavigation(ref(container));
      expect(nav.columnCount()).toBe(1);
    });
  });

  describe('isInGrid', () => {
    it('is false before entering and true once a card is focused', () => {
      container = buildGrid(6, 3);
      const nav = useGridNavigation(ref(container));
      expect(nav.isInGrid()).toBe(false);
      nav.focusFirst();
      expect(nav.isInGrid()).toBe(true);
    });
  });

  describe('move — horizontal', () => {
    beforeEach(() => {
      container = buildGrid(6, 3); // 2 行 × 3 列
    });

    it('moves right and left by one', () => {
      const nav = useGridNavigation(ref(container!));
      nav.focusFirst();
      nav.move('right');
      expect(focusedIndex(container!)).toBe(1);
      nav.move('left');
      expect(focusedIndex(container!)).toBe(0);
    });

    it('clamps at the left edge', () => {
      const nav = useGridNavigation(ref(container!));
      nav.focusFirst();
      nav.move('left');
      expect(focusedIndex(container!)).toBe(0);
    });

    it('clamps at the right edge (last card)', () => {
      const nav = useGridNavigation(ref(container!));
      cardButtons(container!)[5]!.focus();
      nav.move('right');
      expect(focusedIndex(container!)).toBe(5);
    });
  });

  describe('move — vertical (跨列数)', () => {
    beforeEach(() => {
      container = buildGrid(6, 3); // 2 行 × 3 列
    });

    it('moves down by one row (index + cols)', () => {
      const nav = useGridNavigation(ref(container!));
      nav.focusFirst(); // 0
      nav.move('down');
      expect(focusedIndex(container!)).toBe(3);
    });

    it('moves up by one row (index - cols)', () => {
      const nav = useGridNavigation(ref(container!));
      cardButtons(container!)[4]!.focus();
      nav.move('up');
      expect(focusedIndex(container!)).toBe(1);
    });

    it('clamps at the top edge', () => {
      const nav = useGridNavigation(ref(container!));
      nav.focusFirst();
      nav.move('up');
      expect(focusedIndex(container!)).toBe(0);
    });

    it('clamps at the bottom edge', () => {
      const nav = useGridNavigation(ref(container!));
      cardButtons(container!)[4]!.focus(); // 下移到 7 越界
      nav.move('down');
      expect(focusedIndex(container!)).toBe(4);
    });

    it('tracks a different column count (4 cols)', () => {
      container!.remove();
      container = buildGrid(8, 4);
      const nav = useGridNavigation(ref(container));
      nav.focusFirst(); // 0
      nav.move('down');
      expect(focusedIndex(container)).toBe(4);
    });
  });

  describe('move — guards', () => {
    it('does nothing when focus is outside the grid', () => {
      container = buildGrid(6, 3);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      const nav = useGridNavigation(ref(container));
      nav.move('right');
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });
  });

  describe('blur', () => {
    it('blurs the focused card when focus is in the grid', () => {
      container = buildGrid(6, 3);
      const nav = useGridNavigation(ref(container));
      nav.focusFirst();
      expect(focusedIndex(container)).toBe(0);
      nav.blur();
      expect(focusedIndex(container)).toBe(-1);
    });

    it('does not touch focus outside the grid', () => {
      container = buildGrid(6, 3);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      const nav = useGridNavigation(ref(container));
      nav.blur();
      expect(document.activeElement).toBe(outside);
      outside.remove();
    });
  });
});
