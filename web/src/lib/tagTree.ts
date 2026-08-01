// 标签树纯逻辑（Miller 列级联用）。类型用相对路径导入以便 node 环境单测。
import type { Tag } from '../api/types';

function byPath(a: Tag, b: Tag): number {
  return a.path.localeCompare(b.path);
}

export function rootTags(tags: Tag[]): Tag[] {
  return tags.filter((t) => t.parentId === null).sort(byPath);
}

export function childrenOf(tags: Tag[], parentId: number): Tag[] {
  return tags.filter((t) => t.parentId === parentId).sort(byPath);
}

export function hasChildren(tags: Tag[], id: number): boolean {
  return tags.some((t) => t.parentId === id);
}

/** Miller 列：第 0 列=根；drillPath 每个 id 展开其子级为下一列（无子级则停止）。 */
export function columnsForPath(tags: Tag[], drillPath: number[]): Tag[][] {
  const cols: Tag[][] = [rootTags(tags)];
  for (const id of drillPath) {
    const kids = childrenOf(tags, id);
    if (kids.length === 0) break;
    cols.push(kids);
  }
  return cols;
}

/** drillPath 的面包屑名称。 */
export function pathLabels(tags: Tag[], drillPath: number[]): string[] {
  const byId = new Map(tags.map((t) => [t.id, t]));
  return drillPath.map((id) => byId.get(id)?.name).filter((n): n is string => !!n);
}

/** 标签搜索：path 子串匹配，按 path 排序，限 50。 */
export function searchTags(tags: Tag[], query: string): Tag[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tags
    .filter((t) => t.path.toLowerCase().includes(q))
    .sort(byPath)
    .slice(0, 50);
}
