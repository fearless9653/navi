import { describe, expect, it } from 'vitest';
import { calcTablePageSize } from './useResponsiveTablePageSize';

/**
 * calcTablePageSize 单测：按视口高度反解表格每页行数。
 * 常量参照源文件：ROW_HEIGHT=44、OVERHEAD=400、MIN=10、MAX=50。
 * rows = clamp(max(floor((innerHeight−400)/44) − 1, 1), 10, 50)。
 */
function setHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
    writable: true,
  });
}

describe('calcTablePageSize', () => {
  it('矮视口钳到下限 10', () => {
    setHeight(600); // available=200 → floor(200/44)−1=3 → 钳到 10
    expect(calcTablePageSize()).toBe(10);
  });

  it('中等视口按行高反解', () => {
    setHeight(1000); // available=600 → floor(600/44)−1=12
    expect(calcTablePageSize()).toBe(12);
  });

  it('超高视口钳到上限 50', () => {
    setHeight(3000); // available=2600 → floor(2600/44)−1=58 → 钳到 50
    expect(calcTablePageSize()).toBe(50);
  });
});
