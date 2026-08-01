import { describe, expect, it } from 'vitest';
import { formatDate } from './datetime';

describe('formatDate', () => {
  // 接口真实返回的是带秒的 UTC ISO 串。这条只断言「能解析且输出 yyyy-MM-dd
  // 格式、不为空」——具体是哪一天取决于运行环境时区（UTC 的 03:15 在负时区会
  // 落到前一天），所以日历日的正确性由下面「不带 Z」的时区无关用例负责强断言。
  it('parses a real UTC ISO instant into yyyy-MM-dd shape', () => {
    expect(formatDate('2026-06-16T03:15:07.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns empty string for null / undefined / empty input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('returns empty string for an unparseable date', () => {
    expect(formatDate('not-a-date')).toBe('');
  });

  // 以下用例使用「不带 Z」的本地时间字符串：JS 将其按本地时区解析，
  // 各日期字段与运行环境时区无关，因此断言是确定的（不像带 Z 的 UTC
  // 字符串那样依赖测试机时区）。这样才真正验证了「取本地年月日」的逻辑。

  it('zero-pads single-digit months and days', () => {
    expect(formatDate('2026-01-05T00:00:00')).toBe('2026-01-05');
  });

  it('keeps the local calendar day regardless of the time of day', () => {
    // 深夜的本地时刻不应跳到相邻日期。
    expect(formatDate('2026-03-10T23:59:00')).toBe('2026-03-10');
  });

  it('does not roll over at a year boundary', () => {
    expect(formatDate('2026-12-31T23:59:59')).toBe('2026-12-31');
  });
});
