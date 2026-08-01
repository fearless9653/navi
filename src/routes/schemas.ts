import { z } from 'zod';
import { stripSloganMarkup } from '../services/sloganMarkup';

/**
 * 跨路由共享的 Zod schema（prefs 与 transfer 均用）。
 * 单独抽出以避免两处逐字重复、随迭代漂移。
 */

/** 音乐播放列表单曲：地址须为合法 URL，名称 1-100 字。 */
export const musicTrackSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(100),
});

/** 播放列表最大曲目数。prefs 与 transfer 两处校验共用，避免各写一遍而漂移。 */
export const MAX_MUSIC_TRACKS = 20;

/** 播放列表 schema（含长度上限）。 */
export const musicPlaylistSchema = z.array(musicTrackSchema).max(MAX_MUSIC_TRACKS);

/** 个人标语最大字数（仅计可见文本，格式标记不计）。prefs 与 transfer 两处校验共用。 */
export const MAX_SLOGAN_LENGTH = 80;

/**
 * 个人标语原始长度上限（含格式标记）。可见字数另有上限，但配对标记本身可无限堆叠，
 * 故额外封顶原始串长度，防止存储 / 传输 / 解析成本无界。prefs 与 transfer 两处校验共用。
 */
export const MAX_SLOGAN_RAW_LENGTH = 1000;

/** 标语 schema：原始长度 ≤1000 且可见文本 ≤80；格式标记不计入可见字数。保留首尾空格原样存储（用于空格排版），或显式置空。 */
export const sloganSchema = z.union([
  z
    .string()
    // 不 trim 存储：首尾空格是用户排版意图（如行首缩进、末尾留白），需原样保留。
    // 仅拒绝「纯空白」串（与 trim 后为空等价），避免存入不可见标语。
    .refine((s) => s.trim() !== '', { message: 'slogan must not be blank' })
    .max(MAX_SLOGAN_RAW_LENGTH, {
      message: `slogan must be at most ${MAX_SLOGAN_RAW_LENGTH} characters`,
    })
    .refine((s) => stripSloganMarkup(s).length <= MAX_SLOGAN_LENGTH, {
      message: `slogan must be at most ${MAX_SLOGAN_LENGTH} visible characters (markup excluded)`,
    }),
  z.null(),
]);
