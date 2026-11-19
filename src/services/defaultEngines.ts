// 建号时预置的默认搜索引擎；首个为默认引擎。
// 图标使用站点本地静态资源；前端会把空值和历史上的外链默认地址解析为同一组本地图。
export const DEFAULT_SEARCH_ENGINES = [
  {
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q={query}',
    iconUrl: '/icons/engines/google.png',
  },
  {
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q={query}',
    iconUrl: '/icons/engines/bing.png',
  },
  {
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q={query}',
    iconUrl: '/icons/engines/duckduckgo.png',
  },
] as const;
