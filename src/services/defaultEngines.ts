// 建号时预置的默认搜索引擎；首个为默认引擎。
export const DEFAULT_SEARCH_ENGINES = [
  { name: 'Google', urlTemplate: 'https://www.google.com/search?q={query}' },
  { name: 'Bing', urlTemplate: 'https://www.bing.com/search?q={query}' },
  { name: 'DuckDuckGo', urlTemplate: 'https://duckduckgo.com/?q={query}' },
] as const;
