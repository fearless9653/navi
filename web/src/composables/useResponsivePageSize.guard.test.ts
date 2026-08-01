import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 守护测试：useResponsivePageSize 的每页数量计算依赖若干「JS 常量」与
 * 「Tailwind 类 / CSS 变量」跨语言严格对应。Tailwind 类是构建期编译成静态
 * CSS 的字符串，运行时 JS 引用不到（见 useResponsivePageSize.ts 的注释），
 * 只能靠约定同步。此测试把这些约定钉死：改一边忘了另一边就会红，避免
 * 出现「算出的 pageSize 不是实际列数的整数倍 → 末行残缺 / 铺不满一页」。
 *
 * 校验五处耦合：
 *   1. 手机静态列类：BookmarkGrid 的 grid-cols-2 / md:grid-cols-3（模板） ↔
 *      calcGridLayout 手机分支回显的 2/3（JS）。桌面列数由 --bm-cols 动态下发，无静态类。
 *   2. 卡片高度 CARD_HEIGHT ↔ BookmarkCard 的 h-28。
 *   3. 网格间距 GAP ↔ BookmarkGrid 的 sm:gap-4。
 *   4. MOBILE_BREAKPOINT(1024) ↔ HomeView 的 lg: aside 断点 ↔ BookmarkGrid 的媒体查询。
 *   5. 动态变量 --bm-cols / --bm-row-gap：HomeView 下发 ↔ BookmarkGrid 消费
 *      （且媒体查询锚定同一 1024px）。
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

function num(source: string, re: RegExp): number {
  const m = source.match(re);
  if (!m) throw new Error(`pattern not found: ${re}`);
  return Number(m[1]);
}

describe('useResponsivePageSize 跨语言常量守护', () => {
  it('手机静态列类与 calcGridLayout 手机分支回显一致；桌面无静态列类残留', () => {
    const composable = read('web/src/composables/useResponsivePageSize.ts');
    const grid = read('web/src/components/home/BookmarkGrid.vue');

    // 模板侧：仅手机两档静态类。
    expect(grid).toContain('grid-cols-2');
    expect(grid).toContain('md:grid-cols-3');
    // 桌面列数改为 --bm-cols 动态反解后，静态桌面列类必须清除，否则与动态列数打架。
    for (const cls of [
      'lg:grid-cols-',
      'xl:grid-cols-',
      '2xl:grid-cols-',
      '3xl:grid-cols-',
      '4xl:grid-cols-',
    ]) {
      expect(grid, `BookmarkGrid 不应残留静态桌面列类 ${cls}`).not.toContain(cls);
    }

    // JS 侧：手机分支回显 2/3（768 为 md 断点）。
    expect(composable).toContain('window.innerWidth >= 768 ? 3 : 2');
  });

  it('CARD_HEIGHT 等于 BookmarkCard 的 h-28（Tailwind 高度类 ×4px）', () => {
    const composable = read('web/src/composables/useResponsivePageSize.ts');
    const card = read('web/src/components/home/BookmarkCard.vue');

    const cardHeight = num(composable, /CARD_HEIGHT\s*=\s*(\d+)/);
    // 卡片根节点用 h-28；Tailwind 间距单位 = 0.25rem = 4px，故 h-N → N×4 px。
    const twHeight = num(card, /class="flex h-(\d+) flex-col text-left"/) * 4;
    expect(cardHeight).toBe(twHeight);
  });

  it('GAP 等于 BookmarkGrid 的 sm:gap-4（桌面网格间距 ×4px）', () => {
    const composable = read('web/src/composables/useResponsivePageSize.ts');
    const grid = read('web/src/components/home/BookmarkGrid.vue');

    const gap = num(composable, /GAP\s*=\s*(\d+)/);
    // 桌面（width≥1024，故 sm 前缀生效）间距取 sm:gap-4 → 4×4 px。
    const twGap = num(grid, /sm:gap-(\d+)/) * 4;
    expect(gap).toBe(twGap);
  });

  it('MOBILE_BREAKPOINT 的 1024px 与 HomeView 的 lg: aside 断点、BookmarkGrid 媒体查询一致', () => {
    const composable = read('web/src/composables/useResponsivePageSize.ts');
    const home = read('web/src/views/HomeView.vue');
    const grid = read('web/src/components/home/BookmarkGrid.vue');

    expect(num(composable, /MOBILE_BREAKPOINT\s*=\s*(\d+)/)).toBe(1024);
    // HomeView 的两列（侧栏 aside + 网址列表）必须在 lg（1024px）才展开，
    // 否则 <1024 的「手机」布局与固定 pageSize 的前提不符。
    expect(home).toContain('lg:grid-cols-[');
    // BookmarkGrid 的动态列数/行距也必须锚定同一 1024px。
    expect(grid).toContain('@media (min-width: 1024px)');
  });

  it('动态变量 --bm-cols / --bm-row-gap：HomeView 下发、BookmarkGrid 在 1024px 媒体查询内消费', () => {
    const home = read('web/src/views/HomeView.vue');
    const grid = read('web/src/components/home/BookmarkGrid.vue');

    // 下发端：HomeView 把 composable 算出的列数与行距绑到网格容器的 CSS 变量上。
    expect(home).toContain("'--bm-row-gap'");
    expect(home).toContain("'--bm-cols'");
    // 消费端：BookmarkGrid 仅在桌面断点覆盖列数与 row-gap。
    expect(grid).toContain('grid-template-columns: repeat(var(--bm-cols');
    expect(grid).toContain('row-gap: var(--bm-row-gap');
    // 上下边缘 = 行距 − 基础 GAP：calc 里的 1rem 字面量必须等于 GAP（16px = 1rem），
    // 否则边缘与行距不同节奏。改 GAP/sm:gap-4 时需同步这里的 1rem。
    expect(grid).toContain('padding-block: calc(var(--bm-row-gap, 1rem) - 1rem)');
  });
});
