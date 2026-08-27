import { describe, expect, it } from 'vitest';
import { calcGridLayout } from './useResponsivePageSize';

/**
 * calcGridLayout 单测：列数由网格实测宽度反解 + 行数反解 + floor 余数均摊到
 * rows+1 个槽位（rows−1 个行距 + 上下两个边缘）。
 * 常量参照源文件：CARD_HEIGHT=112、GAP=12、RESERVE_BELOW=74、MAX_PAGE_SIZE=72、
 * CARD_MIN_WIDTH=190、MIN_COLS=4、MAX_COLS=8。
 * available = innerHeight − gridTop − RESERVE_BELOW；用例统一取 gridTop=300，
 * 通过 innerHeight 反推出目标 available，便于直接核对期望值。
 * 列数 = clamp(floor((gridWidth+12)/(190+12)), 4, 8)：
 *   gridWidth 1030(1920 视口减侧栏) → floor(1042/202)=5；1440 → 7；824 以下 → 钳到 4。
 */

const GRID_TOP = 300;
const RESERVE_BELOW = 74;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', {
    value: height,
    configurable: true,
    writable: true,
  });
}

/** 让 available 恰为指定值的 innerHeight。 */
function heightFor(available: number): number {
  return available + GRID_TOP + RESERVE_BELOW;
}

describe('calcGridLayout', () => {
  it('手机布局（视口 < 1024）：固定 pageSize 与固定行距，cols 回显静态类取值', () => {
    setViewport(800, 600);
    expect(calcGridLayout(GRID_TOP, 760)).toEqual({ size: 12, rowGap: 12, cols: 3 });
    setViewport(600, 600);
    expect(calcGridLayout(GRID_TOP, 560)).toEqual({ size: 12, rowGap: 12, cols: 2 });
  });

  it('列数按网格宽度反解：1920 视口、网格 1030px → 5 列（而非旧的视口分档 6 列）', () => {
    // available=484 恰容 4 行（4×112 + 3×12）。
    setViewport(1920, heightFor(484));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 20, rowGap: 12, cols: 5 });
  });

  it('窄网格：列数钳到下限 4（卡片可窄于 CARD_MIN_WIDTH，但不再减列）', () => {
    setViewport(1024, heightFor(484));
    expect(calcGridLayout(GRID_TOP, 600)).toEqual({ size: 16, rowGap: 12, cols: 4 });
  });

  it('超宽网格：列数钳到上限 8', () => {
    setViewport(3840, heightFor(484));
    expect(calcGridLayout(GRID_TOP, 3400)).toEqual({ size: 32, rowGap: 12, cols: 8 });
  });

  it('有余数：均摊到 rows+1 个槽位（leftover / (rows+1)）', () => {
    // available=544 → 4 行 + 余 60 → 5 个槽位（3 行距 + 上下边缘）各 +12。
    setViewport(1920, heightFor(544));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 20, rowGap: 24, cols: 5 });
  });

  it('非整除余数：floor 取整（不 round），网格总高恒 ≤ available', () => {
    // available=542 → 4 行 + 余 58 → 58/5=11.6，floor 到 11 → rowGap 23。
    setViewport(1920, heightFor(542));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 20, rowGap: 23, cols: 5 });
  });

  it('大余数：行距封顶 3×GAP（36px），残余留在底部', () => {
    // available=308 → 2 行 + 余 72 → 72/3=24 = 2×GAP，钳到 +24 → rowGap 36。
    setViewport(1920, heightFor(308));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 10, rowGap: 36, cols: 5 });
  });

  it('单行：仍有上下边缘两个槽位可摊', () => {
    // available=130 → 1 行 + 余 18 → 18/2=9 → rowGap 21（体现在 padding-block）。
    setViewport(1920, heightFor(130));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 5, rowGap: 21, cols: 5 });
  });

  it('行数被 MAX_PAGE_SIZE 钳制时：巨大余数同样封顶', () => {
    // 5 列上限 floor(72/5)=14 行；available=2084 触发 14 行（base 1724 + leftover 360），
    // leftover=360 → 360/15=24 = 2×GAP → 封顶 +24 → rowGap 36。
    setViewport(1920, heightFor(2084));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 70, rowGap: 36, cols: 5 });
  });

  it('视口矮于一行：leftover 为负时 clamp 到 0，不产生负行距', () => {
    // available=60 < 112 → 仍按下限 1 行；leftover 负 → rowGap 恒 12。
    setViewport(1920, heightFor(60));
    expect(calcGridLayout(GRID_TOP, 1030)).toEqual({ size: 5, rowGap: 12, cols: 5 });
  });
});
