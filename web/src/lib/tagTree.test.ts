import { describe, it, expect } from 'vitest';
import {
  rootTags,
  childrenOf,
  hasChildren,
  columnsForPath,
  pathLabels,
  searchTags,
} from './tagTree';
import type { Tag } from '@/api/types';

const T = (id: number, name: string, parentId: number | null, path: string): Tag => ({
  id,
  name,
  parentId,
  path,
  createdDate: '2021-12-20T00:00:00.000Z',
  lastModifiedDate: '2021-12-20T00:00:00.000Z',
});

// 技术 > python > django ; 阅读
const tags: Tag[] = [
  T(1, '技术', null, '技术'),
  T(2, 'python', 1, '技术/python'),
  T(3, 'django', 2, '技术/python/django'),
  T(4, '阅读', null, '阅读'),
];

describe('tagTree', () => {
  it('rootTags 取一级、按 path 排序', () => {
    expect(rootTags(tags).map((t) => t.name)).toEqual(['技术', '阅读']);
  });

  it('childrenOf / hasChildren', () => {
    expect(childrenOf(tags, 1).map((t) => t.name)).toEqual(['python']);
    expect(hasChildren(tags, 1)).toBe(true);
    expect(hasChildren(tags, 3)).toBe(false);
  });

  it('columnsForPath 按 drill 展开多列', () => {
    expect(columnsForPath(tags, []).length).toBe(1);
    const cols = columnsForPath(tags, [1, 2]);
    expect(cols.length).toBe(3);
    expect(cols[2]!.map((t) => t.name)).toEqual(['django']);
  });

  it('叶子节点不再产生新列', () => {
    expect(columnsForPath(tags, [1, 2, 3]).length).toBe(3); // django 无子级
  });

  it('pathLabels 面包屑', () => {
    expect(pathLabels(tags, [1, 2])).toEqual(['技术', 'python']);
  });

  it('searchTags 子串匹配（含 CJK）', () => {
    expect(searchTags(tags, 'python').map((t) => t.path)).toEqual([
      '技术/python',
      '技术/python/django',
    ]);
    expect(searchTags(tags, '阅读').map((t) => t.name)).toEqual(['阅读']);
    expect(searchTags(tags, '')).toEqual([]);
  });
});
