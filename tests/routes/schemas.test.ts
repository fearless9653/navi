import { describe, expect, it } from 'vitest';
import { MAX_SLOGAN_LENGTH, MAX_SLOGAN_RAW_LENGTH, sloganSchema } from '@/routes/schemas';

describe('sloganSchema', () => {
  it('null 通过', () => {
    expect(sloganSchema.safeParse(null).success).toBe(true);
  });

  it('纯文本限长：恰好上限通过、超一字符失败', () => {
    expect(sloganSchema.safeParse('a'.repeat(MAX_SLOGAN_LENGTH)).success).toBe(true);
    expect(sloganSchema.safeParse('a'.repeat(MAX_SLOGAN_LENGTH + 1)).success).toBe(false);
  });

  it('格式标记不计入长度：上限可见字 + 标记通过', () => {
    expect(sloganSchema.safeParse(`<b>${'a'.repeat(MAX_SLOGAN_LENGTH)}</b>`).success).toBe(true);
    expect(sloganSchema.safeParse(`<c=red>${'a'.repeat(MAX_SLOGAN_LENGTH)}</c>`).success).toBe(
      true,
    );
  });

  it('可见字超限：标记包裹的超长文本失败', () => {
    expect(sloganSchema.safeParse(`<b>${'a'.repeat(MAX_SLOGAN_LENGTH + 1)}</b>`).success).toBe(
      false,
    );
  });

  it('未闭合标记计入字数（与渲染一致）', () => {
    // '<b>'（3）+ 77 = 80 通过；+ 78 = 81 失败
    expect(sloganSchema.safeParse(`<b>${'a'.repeat(MAX_SLOGAN_LENGTH - 3)}`).success).toBe(true);
    expect(sloganSchema.safeParse(`<b>${'a'.repeat(MAX_SLOGAN_LENGTH - 2)}`).success).toBe(false);
  });

  it('保留首尾空格原样存储（用于空格排版，标记保留）', () => {
    const parsed = sloganSchema.safeParse('  <b>hi</b>  ');
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error('expected success');
    expect(parsed.data).toBe('  <b>hi</b>  ');
  });

  it('纯空白串被拒绝（不存入不可见标语）', () => {
    expect(sloganSchema.safeParse('   ').success).toBe(false);
    expect(sloganSchema.safeParse('\n\t ').success).toBe(false);
  });

  it('现有占位标语通过（回归）', () => {
    expect(sloganSchema.safeParse('把时间留给热爱的事。').success).toBe(true);
  });

  it('原始长度限长：恰好上限通过、超一字符失败', () => {
    // 用配对标记 <b></b>（7 字符、0 可见字）把原始长度撑到上限附近、仅留少量可见字，
    // 从而脱离"可见字 ≤80"的限制，单独验证原始长度上限。
    const tag = '<b></b>';
    const tail = 'abcdef'; // 6 个可见字
    const pairs = Math.floor((MAX_SLOGAN_RAW_LENGTH - tail.length) / tag.length);
    const atMax = tag.repeat(pairs) + tail; // 恰好 MAX_SLOGAN_RAW_LENGTH、可见字 6
    expect(atMax.length).toBe(MAX_SLOGAN_RAW_LENGTH);
    expect(sloganSchema.safeParse(atMax).success).toBe(true);
    // 多 1 个可见字：可见字 7 仍 ≤80，但原始长度超限 → 失败
    expect(sloganSchema.safeParse(atMax + 'g').success).toBe(false);
  });

  it('可见字未超但原始超限失败（大量配对标记）', () => {
    // <b></b> 共 7 字符、0 可见字；重复后可见字恒为 0，但原始串远超 1000 上限。
    expect(sloganSchema.safeParse('<b></b>'.repeat(MAX_SLOGAN_RAW_LENGTH)).success).toBe(false);
  });
});
