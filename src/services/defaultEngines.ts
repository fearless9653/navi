// 建号时预置的默认搜索引擎；首个为默认引擎。
export const DEFAULT_SEARCH_ENGINES = [
  {
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    iconUrl: 'https://www.google.com/favicon.ico',
  },
  {
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}',
    iconUrl:
      'https://edgestatic.azureedge.net/shared/cms/lrs1c69a1j/logos/b3bed8dc525c4433afbdd24bb71ea2fc-png-w128.avif',
  },
  {
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    iconUrl: 'https://duckduckgo.com/static-assets/favicons/favicon.ico',
  },
] as const;
