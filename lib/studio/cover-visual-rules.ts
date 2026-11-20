import { z } from "zod";

// Adapted from baoyu-cover-image 1.56.1: auto-selection, types, presets and compatibility.
const options = {
  type: {
    hero: "发布与品牌亮相。让主视觉占约六到七成，建立明确的主次关系。",
    conceptual: "技术架构与方法。用物件、形状或空间关系解释核心机制，保持层次清楚。",
    typography: "观点与引语。标题是视觉主角，占约四成以上，少用辅助图形。",
    metaphor: "抽象观点与反思。用一个具体物件或动作承载寓意。",
    scene: "故事、旅行和生活体验。用可辨认的场景、环境和光线建立叙事。",
    minimal: "聚焦本质。只保留一个主要元素，约六成画面留白。",
  },
  palette: {
    warm: "个人叙事与生活。用奶油底、暖橙和深棕。",
    elegant: "商务、专业与文化。用暖米白、低饱和珊瑚、灰青和少量金色。",
    cool: "技术、系统和数据。用浅灰、工程蓝和青色，琥珀色可作小面积强调。",
    dark: "娱乐、夜景和高端视觉。用近黑或深蓝为底，以紫、青或暖光点亮主体。",
    earth: "自然、旅行和可持续。用沙色底、森林绿和泥土棕。",
    vivid: "活动、上线和游戏。用鲜明主色和少量对比色形成焦点。",
    pastel: "轻松创意、儿童和幻想。用浅奶油底、柔粉、薄荷或薰衣草。",
    mono: "极简、纯粹。用黑、白、灰及一个与题材相关的点缀色。",
    retro: "历史、怀旧和复古。用旧纸底、珊瑚红、芥末黄或复古绿。",
    duotone: "电影、唱片或海报。用两种主色分离亮暗层次，以炭黑或暖白调节可读性。",
  },
  rendering: {
    "flat-vector": "现代、清晰的图形。几何块面、统一线宽、实色填充，以二维叠压表达关系。",
    "hand-drawn": "个人化与手记。自然笔触、变化线宽、适量纸纹和轻微手绘感。",
    painterly: "艺术、柔和或幻想。保留笔触和色彩渗透，以软边、薄涂和色层组织深度。",
    digital: "技术、数据与精致的现代设计。边缘准确，用克制的渐变或光影区分层次。",
    pixel: "游戏、怀旧。像素对齐，使用有限色阶、阶梯边缘和少量抖动。",
    chalk: "教学、课堂、讲解。粉笔颗粒、断续笔触、黑板质感。",
    "screen-print": "电影与印刷海报。使用限色块面、网点和细纸纹，通过剪影叠放表达层次。",
  },
  text: {
    none: "纯视觉。画面不出现文字，全部空间留给图像。",
    "title-only": "普通文章封面的默认选择。仅一个醒目标题，约预留一成半画面。",
    "title-subtitle": "系列、教程或需补背景。用较小的副标题支持主标题，约预留四分之一画面。",
    "text-rich": "活动、公告、信息型封面。主标题、副标题及两到四个短标签，约预留四成画面。",
  },
  mood: {
    subtle: "专业沉静。降低画面饱和度和装饰重量，保持主体轮廓清晰。",
    balanced: "平衡。适度的明暗对比和饱和度，视觉重量均衡。",
    bold: "宣传与动态场面。更强对比、色彩和视觉重量，集中在主视觉。",
  },
  font: {
    clean: "干净清晰的几何无衬线，均匀笔画。",
    handwritten: "自然手写或手绘笔画，字形要清楚。",
    serif: "编辑感的衬线字形，精致、结构明确。",
    display: "有表现力的粗字形，醒目且可辨认。",
  },
} as const;

const option = <Key extends string>(entries: Record<Key, string>) =>
  z.enum(Object.keys(entries) as Key[]);

export const coverDirectionSchema = z.object({
  type: option(options.type),
  palette: option(options.palette),
  rendering: option(options.rendering),
  text: option(options.text),
  mood: option(options.mood),
  font: option(options.font),
}).strict();

export type CoverDirection = z.infer<typeof coverDirectionSchema>;

const presets = {
  elegant: ["elegant", "hand-drawn"],
  blueprint: ["cool", "digital"],
  chalkboard: ["dark", "chalk"],
  "dark-atmospheric": ["dark", "digital"],
  "editorial-infographic": ["cool", "digital"],
  "fantasy-animation": ["pastel", "painterly"],
  "flat-doodle": ["pastel", "flat-vector"],
  "intuition-machine": ["retro", "digital"],
  minimal: ["mono", "flat-vector"],
  nature: ["earth", "hand-drawn"],
  notion: ["mono", "digital"],
  "pixel-art": ["vivid", "pixel"],
  playful: ["pastel", "hand-drawn"],
  retro: ["retro", "digital"],
  "sketch-notes": ["warm", "hand-drawn"],
  "vector-illustration": ["retro", "flat-vector"],
  vintage: ["retro", "hand-drawn"],
  warm: ["warm", "hand-drawn"],
  "warm-flat": ["warm", "flat-vector"],
  watercolor: ["earth", "painterly"],
  "poster-art": ["retro", "screen-print"],
  mondo: ["mono", "screen-print"],
  "art-deco": ["elegant", "screen-print"],
  propaganda: ["vivid", "screen-print"],
  cinematic: ["duotone", "screen-print"],
} as const satisfies Record<string, readonly [CoverDirection["palette"], CoverDirection["rendering"]]>;

export function coverDirectionOverrides(brief: string): Partial<CoverDirection> {
  // Quoted lettering is artwork copy, even when it happens to contain option syntax.
  const unquoted = brief.replace(/「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"/gu, "");
  const flags = new Map(Array.from(
    unquoted.matchAll(/(?:^|\s)--([a-z-]+)(?:[=\s]+([a-z][a-z-]*))?(?=$|\s|[，。；,;])/giu),
    ([, name, value]) => [name.toLowerCase(), value?.toLowerCase()],
  ));
  const style = flags.get("style");
  const preset = style && Object.hasOwn(presets, style) ? presets[style as keyof typeof presets] : undefined;
  const dimensions = Object.entries(options).flatMap(([key, variants]) => {
    const value = flags.get(key);
    return value && Object.hasOwn(variants, value) ? [[key, value]] : [];
  });
  return {
    ...(preset && { palette: preset[0], rendering: preset[1] }),
    ...Object.fromEntries(dimensions),
    ...(flags.has("no-title") && { text: "none" }),
  };
}

export const coverSelectionRules = [
  ...Object.entries(options).map(([key, choices]) =>
    `${key}\n${Object.entries(choices).map(([value, rule]) => `${value} · ${rule}`).join("\n")}`,
  ),
  `命名风格代表配色与绘制方式的组合，可以单独覆盖某项。\n${Object.entries(presets).map(
    ([preset, [palette, rendering]]) => `${preset}=${palette}/${rendering}`,
  ).join("，")}`,
  "自动选择时避免这些组合。cool 和 mono 避免 painterly。elegant 和 earth 避免 pixel、chalk。pastel 避免 pixel、chalk、screen-print。retro 避免 chalk。duotone 优先 screen-print，也可用 digital 或 flat-vector。",
  "conceptual 避免 painterly，metaphor 避免 pixel，scene 避免 flat-vector、chalk，minimal 避免 pixel、chalk 或过强的 bold。无字时避免 typography，文字密集时避免 metaphor、scene、minimal。hand-drawn 适合 handwritten，digital 适合 clean 或 serif，pixel 和 screen-print 适合 display。",
].join("\n\n");

export function coverDirections(direction: CoverDirection) {
  const { type, rendering, text, mood, font } = direction;
  return {
    type: options.type[type],
    rendering: options.rendering[rendering],
    text: options.text[text],
    mood: options.mood[mood],
    font: options.font[font],
  };
}
