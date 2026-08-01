import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('font loading', () => {
  it('does not load unused display or Chinese web fonts', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'web/index.html'), 'utf8');
    const styles = readFileSync(resolve(process.cwd(), 'web/src/style.css'), 'utf8');

    expect(indexHtml).not.toContain('LXGW+WenKai');
    expect(indexHtml).not.toContain('Playfair+Display');
    expect(styles).not.toContain('LXGW WenKai');
    expect(styles).not.toContain('Playfair Display');
  });
});
