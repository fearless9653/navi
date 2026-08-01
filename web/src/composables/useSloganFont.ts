import { computed, ref } from 'vue';

interface LocalFontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
  }
}

export interface SloganFontOption {
  family: string;
}

const STORAGE_KEY = 'navi_slogan_font_family';
const LEGACY_STORAGE_KEY = 'navi_slogan_system_font';
const selectedSloganFontFamily = ref('');
const localFontOptions = ref<SloganFontOption[]>([]);
const localFontsSupported = ref(true);
const localFontsLoading = ref(false);
const localFontsError = ref('');

function readSavedValue(): string {
  if (typeof localStorage === 'undefined') return '';
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  return localStorage.getItem(STORAGE_KEY) ?? '';
}

function quoteFontFamily(family: string): string {
  return `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}", var(--font-sans)`;
}

export function useSloganFont() {
  selectedSloganFontFamily.value = readSavedValue();

  const sloganFontStyle = computed(() =>
    selectedSloganFontFamily.value
      ? { fontFamily: quoteFontFamily(selectedSloganFontFamily.value) }
      : {},
  );

  function setSelectedSloganFontFamily(value: string): void {
    selectedSloganFontFamily.value = value;
    localStorage.setItem(STORAGE_KEY, value);
  }

  async function loadLocalFonts(): Promise<void> {
    localFontsError.value = '';
    if (typeof window === 'undefined' || typeof window.queryLocalFonts !== 'function') {
      localFontsSupported.value = false;
      localFontsError.value = 'unsupported';
      return;
    }

    localFontsLoading.value = true;
    try {
      const fonts = await window.queryLocalFonts();
      const families = [...new Set(fonts.map((font) => font.family).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      );
      localFontOptions.value = families.map((family) => ({ family }));
      localFontsSupported.value = true;
    } catch {
      localFontsError.value = 'denied';
    } finally {
      localFontsLoading.value = false;
    }
  }

  if (
    selectedSloganFontFamily.value &&
    !localFontOptions.value.some((font) => font.family === selectedSloganFontFamily.value)
  ) {
    localFontOptions.value = [
      { family: selectedSloganFontFamily.value },
      ...localFontOptions.value,
    ];
  }

  return {
    selectedSloganFontFamily,
    sloganFontStyle,
    localFontOptions,
    localFontsSupported,
    localFontsLoading,
    localFontsError,
    setSelectedSloganFontFamily,
    loadLocalFonts,
  };
}
