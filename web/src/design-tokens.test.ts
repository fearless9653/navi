import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function hexToRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenValue(source: string, token: string): string {
  const match = source.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6});`));
  if (!match) throw new Error(`Missing token ${token}`);
  return match[1]!;
}

describe('design tokens', () => {
  it('defines semantic foreground and elevation tokens', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');

    expect(source).toContain('--color-on-accent:');
    expect(source).toContain('--color-on-danger:');
    expect(source).toContain('--glass-blur-strong:');
    expect(source).toContain('--shadow-action-hover:');
    expect(source).toContain('--shadow-danger-hover:');
    expect(source).toContain('--z-floating:');
    expect(source).toContain('--z-skip-link:');
  });

  it('keeps action foreground colors stable across states and themes', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');
    const darkBlock = source.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

    expect(tokenValue(source, '--color-on-accent')).toBe('#ffffff');
    expect(tokenValue(source, '--color-on-danger')).toBe('#ffffff');
    expect(darkBlock).not.toContain('--color-on-accent:');
    expect(darkBlock).not.toContain('--color-on-danger:');
  });

  it('keeps light-mode secondary text readable on pale surfaces', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');
    const backgrounds = [
      '#ffffff',
      tokenValue(source, '--color-surface-muted'),
      tokenValue(source, '--color-background'),
    ];
    const textTokens = ['--color-text-secondary', '--color-text-subtle', '--color-text-faint'];

    for (const token of textTokens) {
      const color = tokenValue(source, token);
      for (const background of backgrounds) {
        expect(
          contrastRatio(color, background),
          `${token} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('defines a mobile-safe bottom offset for home floating controls', () => {
    const source = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');

    expect(source).toContain(
      '--home-floating-control-bottom: calc(var(--spacing-6) + env(safe-area-inset-bottom));',
    );
    expect(source).toContain('@media (width < 64rem)');
    expect(source).toContain(
      '--home-floating-control-bottom: calc(6.5rem + env(safe-area-inset-bottom));',
    );
  });
});
