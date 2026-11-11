/** GBK / GB2312 解码回退（Workers 的 TextDecoder 通常不含这些编码）。 */
import { GBK_TABLE } from './gbk-table';

const TRAIL_COUNT = 190;
const TRAIL_INDEX = new Uint8Array(256).fill(255);

for (let t = 0x40; t <= 0x7e; t++) TRAIL_INDEX[t] = t - 0x40;
for (let t = 0x80; t <= 0xfe; t++) TRAIL_INDEX[t] = 63 + (t - 0x80);

/** 把 GBK/GB2312 字节解码为字符串；非法序列替换为 U+FFFD。 */
export function decodeGbk(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (b < 0x80) {
      out.push(String.fromCharCode(b));
      continue;
    }
    const trail = bytes[i + 1];
    const leadIdx = b - 0x81;
    const trailIdx = trail === undefined ? 255 : TRAIL_INDEX[trail]!;
    if (trail === undefined || leadIdx < 0 || leadIdx > 0x7d || trailIdx === 255) {
      out.push('\uFFFD');
      continue;
    }
    i += 1;
    out.push(GBK_TABLE[leadIdx * TRAIL_COUNT + trailIdx] ?? '\uFFFD');
  }
  return out.join('');
}
