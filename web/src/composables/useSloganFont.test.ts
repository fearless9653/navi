import { beforeEach, describe, expect, it } from 'vitest';
import { useSloganFont } from './useSloganFont';

describe('useSloganFont', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to the app font', () => {
    const { selectedSloganFontFamily, sloganFontStyle } = useSloganFont();

    expect(selectedSloganFontFamily.value).toBe('');
    expect(sloganFontStyle.value).toEqual({});
  });

  it('stores the selected local font family in this browser only', () => {
    const { selectedSloganFontFamily, sloganFontStyle, setSelectedSloganFontFamily } =
      useSloganFont();

    setSelectedSloganFontFamily('Source Han Sans SC');

    expect(selectedSloganFontFamily.value).toBe('Source Han Sans SC');
    expect(localStorage.getItem('navi_slogan_font_family')).toBe('Source Han Sans SC');
    expect(sloganFontStyle.value).toEqual({
      fontFamily: '"Source Han Sans SC", var(--font-sans)',
    });
  });

  it('ignores the old boolean system-font setting', () => {
    localStorage.setItem('navi_slogan_system_font', 'true');

    const { selectedSloganFontFamily, sloganFontStyle } = useSloganFont();

    expect(selectedSloganFontFamily.value).toBe('');
    expect(sloganFontStyle.value).toEqual({});
  });
});
