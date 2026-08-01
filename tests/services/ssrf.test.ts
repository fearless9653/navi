import { describe, it, expect } from 'vitest';
import { isPrivateIPv4, isPrivateIPv6, isBlockedAddress, assertSafeUrl } from '@/services/ssrf';

describe('isPrivateIPv4', () => {
  it.each([
    ['10.0.0.1', true],
    ['127.0.0.1', true],
    ['192.168.1.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['169.254.169.254', true], // 云元数据
    ['100.64.0.1', true], // CGNAT
    ['0.0.0.0', true],
    ['224.0.0.1', true], // 多播
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['172.32.0.1', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIPv4(ip)).toBe(expected);
  });
});

describe('isPrivateIPv6', () => {
  it.each([
    ['::1', true],
    ['::', true],
    ['fe80::1', true],
    ['fc00::1', true],
    ['fd12:3456::1', true],
    ['::ffff:127.0.0.1', true], // IPv4-mapped 私网
    ['2001:4860:4860::8888', false],
    ['::ffff:8.8.8.8', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateIPv6(ip)).toBe(expected);
  });
});

describe('isBlockedAddress', () => {
  it('对 v4/v6 私网统一判定', () => {
    expect(isBlockedAddress('10.0.0.1')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
  });
});

describe('assertSafeUrl', () => {
  it('公网 URL 通过并返回 URL', () => {
    const u = assertSafeUrl('https://example.com/path');
    expect(u.hostname).toBe('example.com');
    expect(assertSafeUrl('https://1.1.1.1').hostname).toBe('1.1.1.1');
  });

  it.each([
    'http://127.0.0.1',
    'http://10.0.0.1',
    'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1',
    'http://0.0.0.0',
    'http://[::1]',
    'http://[::ffff:127.0.0.1]',
    'http://[fe80::1]',
    'http://localhost',
    'http://app.localhost',
    'ftp://example.com',
    'file:///etc/passwd',
    'http://user:pass@example.com',
    'not a url',
  ])('拒绝 %s', (url) => {
    expect(() => assertSafeUrl(url)).toThrow();
  });
});
