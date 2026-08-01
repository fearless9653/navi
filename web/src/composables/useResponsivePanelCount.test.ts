import { describe, expect, it } from 'vitest';
import { calcPanelCount } from './useResponsivePanelCount';

/**
 * calcPanelCount 单测：侧栏单开面板的条数反解（面板铺满分段条以下的全部侧栏高）。
 * 常量参照源文件：ROW_HEIGHT=28、ROW_GAP=2、SEG_BAR_HEIGHT=40、CONTAINER_GAP=12、
 * HEADER_OFFSET=44、PAD_BOTTOM=16、RESERVE_BELOW=16、MIN=3、MAX=50、MOBILE_COUNT=8。
 * available = innerHeight − asideTop − RESERVE_BELOW；用例统一取 asideTop=300，
 * 通过 innerHeight 反推出目标 available，便于直接核对期望值。
 * 列表高 = available − SEG_BAR_HEIGHT − CONTAINER_GAP − HEADER_OFFSET − PAD_BOTTOM = available − 112，
 * 条数 = floor((列表高 + ROW_GAP) / (ROW_HEIGHT + ROW_GAP)) = floor((列表高 + 2) / 30)。
 */

const ASIDE_TOP = 300;
const RESERVE_BELOW = 16;

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
  return available + ASIDE_TOP + RESERVE_BELOW;
}

describe('calcPanelCount', () => {
  it('手机布局（宽 < 1024）：固定条数，不参与反解', () => {
    setViewport(800, 600);
    expect(calcPanelCount(ASIDE_TOP)).toBe(8);
  });

  it('恰好整行：available=410 → 列表高 298 恰容 10 行（10×28 + 9×2）', () => {
    setViewport(1280, heightFor(410));
    expect(calcPanelCount(ASIDE_TOP)).toBe(10);
  });

  it('非整除：floor 向下取整，内容绝不超出面板', () => {
    // available=409 → 列表高 297 → (299)/30 = 9.96 → 9。
    setViewport(1280, heightFor(409));
    expect(calcPanelCount(ASIDE_TOP)).toBe(9);
  });

  it('矮视口：反解为负也钳到下限 3（面板 + ul overflow 兜底）', () => {
    setViewport(1280, heightFor(100));
    expect(calcPanelCount(ASIDE_TOP)).toBe(3);
  });

  it('超高视口：钳到上限 50（对齐后端 limit 上限）', () => {
    // available=2000 → 列表高 1888 → (1890)/30 = 63 → 钳到 50。
    setViewport(1280, heightFor(2000));
    expect(calcPanelCount(ASIDE_TOP)).toBe(50);
  });
});
