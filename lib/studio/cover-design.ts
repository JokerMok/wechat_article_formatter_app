import { z } from "zod";
import { coverDirections, coverDirectionSchema } from "./cover-visual-rules";

export const coverPromptMaxLength = 3600;

export function coverImageFrame(width: number, height: number) {
  const imageWidth = width > height ? 1536 : 1024;
  const imageHeight = height > width ? 1536 : 1024;
  const scale = Math.max(width / imageWidth, height / imageHeight);
  const safeWidth = Math.floor(88 * width / (imageWidth * scale));
  const safeHeight = Math.floor(88 * height / (imageHeight * scale));
  return {
    size: `${imageWidth}x${imageHeight}`,
    safeWidth,
    safeHeight,
  };
}

const coverLine = z.string().trim().refine((line) => !/[\r\n]/.test(line));
export const coverDesignSchema = z.object({
  angle: z.string().trim().min(6).max(120),
  summary: z.string().trim().min(10).max(240),
  keywords: z.array(coverLine.min(1).max(24)).min(5).max(8),
  theme: coverLine.min(2).max(32),
  direction: coverDirectionSchema,
  language: coverLine.min(2).max(32),
  headline: coverLine.max(280),
  subtitle: coverLine.max(280),
  tags: z.array(coverLine.min(1).max(20)).max(4),
  concept: z.string().trim().min(15).max(280),
  composition: z.string().trim().min(15).max(220),
  typography: z.string().trim().max(160),
  colors: z.string().trim().min(10).max(140),
  finish: z.string().trim().min(12).max(180),
  referenceTreatment: z.string().trim().max(200).default(""),
}).strict();

type CoverDesign = z.infer<typeof coverDesignSchema>;

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const coverReferenceSchema = z.object({
  background: color,
  foreground: color,
  accent: color,
  composition: z.enum(["left", "center", "bottom"]),
  fontFamily: z.enum(["sans", "serif"]),
  referenceNotes: z.string().trim().min(1).max(340),
});

type CoverReference = z.infer<typeof coverReferenceSchema>;

export function learnedCoverReference(style: string) {
  try {
    const parsed = coverReferenceSchema.safeParse(JSON.parse(style));
    if (parsed.success) return parsed.data;
  } catch { /* Older clients can provide a plain style description. */ }
}

function normalizedCopy(line: string) {
  return line.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function visualLength(line: string) {
  return Array.from(line).reduce(
    (length, character) => length + (/^[\x00-\x7F]$/.test(character) ? 0.55 : 1),
    0,
  );
}

export function coverCopyIssue(design: CoverDesign, articleTitle: string, brief: string) {
  const { headline, subtitle, tags, direction: { text } } = design;
  const specifiedHeadline = brief.match(/(?:主标题|封面标题)\s*(?:(?:用|写成|为|是|使用)\s*)?[：:=]?\s*[「『“"]([^」』”"\r\n]+)[」』”"]/u)?.[1];
  const specifiedSubtitle = brief.match(/副标题\s*(?:(?:用|写成|为|是|使用)\s*)?[：:=]?\s*[「『“"]([^」』”"\r\n]+)[」』”"]/u)?.[1];
  if ((specifiedHeadline && headline !== specifiedHeadline) ||
      (specifiedSubtitle && subtitle !== specifiedSubtitle))
    return "有明确指定的主标题或副标题，必须逐字使用，保留标点与大小写。";
  if (text === "none")
    return headline || subtitle || tags.length || design.typography ? "纯视觉封面的文字与排版字段都必须为空。" : undefined;

  const exactCopy = (line: string) =>
    [`「${line}」`, `『${line}』`, `“${line}”`, `"${line}"`].some((quote) => brief.includes(quote));
  const title = normalizedCopy(articleTitle);
  const main = normalizedCopy(headline);
  const support = normalizedCopy(subtitle);
  if (!main || (support && main === support))
    return "主标题须有实际文案，副标题不得复述主标题。";
  if (design.typography.length < 10)
    return "有文字的封面需要写明字形、层级和文字位置。";
  if ((text === "title-only" && (subtitle || tags.length)) ||
      (text === "title-subtitle" && (!support || tags.length)) ||
      (text === "text-rich" && (!support || tags.length < 2)))
    return "文字密度须与文案对应。title-only 仅主标题，title-subtitle 需要主副标题，text-rich 需要主副标题及两到四个标签。";

  const copiesLongTitle = title.length > 0 && visualLength(articleTitle) > 12 &&
    [main, support, main + support].some((line) => line.length >= title.length * 0.8 && title.includes(line));
  if (copiesLongTitle && !exactCopy(headline) && (!subtitle || !exactCopy(subtitle)))
    return "文案仍在复述或拆分长篇原题。提炼文章的独到发现，重新写封面主标题。";
  if ((!exactCopy(headline) && visualLength(headline) > 16) ||
      (subtitle && !exactCopy(subtitle) && visualLength(subtitle) > 26))
    return "文案超过缩略图可读的字量。缩短主标题，副标题只保留一个有用的补充。";
}

export function composeCoverPrompt(
  design: CoverDesign,
  { title, width, height, reference }: { title: string; width: number; height: number; reference?: CoverReference },
) {
  const { size, safeWidth, safeHeight } = coverImageFrame(width, height);
  const { direction, headline, subtitle, tags } = design;
  const rules = coverDirections(direction);
  const hasLettering = direction.text !== "none";
  const lettering = hasLettering ? [
    `只绘制下方引号内的文案，以${design.language}逐字呈现。\n主标题「${headline}」`,
    ...(subtitle ? [`副标题「${subtitle}」`] : []),
    ...tags.map((tag) => `标签「${tag}」`),
  ] : ["画面不出现文字、数字或标签。"];
  const placements = { left: "左侧布局", center: "居中布局", bottom: "底部布局" };
  return [
    "# 画面文案",
    ...lettering,
    "\n# 文章语境（仅供构思）",
    ...(title ? [`原题 ${title}`] : []),
    `摘要 ${design.summary}\n关键词 ${design.keywords.join("、")}`,
    `\n# 视觉设计\n封面主题 ${design.theme}\n版式 ${direction.type} · 配色 ${direction.palette} · 绘制 ${direction.rendering}\n文字密度 ${direction.text} · 情绪 ${direction.mood}${hasLettering ? ` · 字体 ${direction.font}` : ""}\n最终画幅 ${width} × ${height}`,
    `\n# 画面构思\n${design.concept}`,
    `\n# 构图与留白\n${rules.type}\n${rules.text}\n${design.composition}`,
    `\n# 色彩与质感\n本张配色 ${design.colors}\n${rules.rendering}\n${rules.mood}\n${design.finish}`,
    ...(hasLettering ? [`\n# 文字排版\n${rules.font}\n${design.typography}`] : []),
    ...(reference ? [
      "\n# 参考封面",
      `融入已提取的视觉特征。参考底色 ${reference.background}，点缀色 ${reference.accent}，${placements[reference.composition]}。`,
      ...(hasLettering ? [`参考字色 ${reference.foreground}，${reference.fontFamily === "serif" ? "衬线" : "无衬线"}字形。`] : []),
      reference.referenceNotes,
      `在本张封面的应用方式 ${design.referenceTreatment}`,
    ] : []),
    `\n# 输出\n以 ${size.replace("x", " × ")} 的生图画布构图，适配最终裁切。文字与视觉焦点位于画布中央 ${safeWidth}% 宽、${safeHeight}% 高的区域，背景延伸到画布四边。只绘制「画面文案」区列出的文字，避免水印和无关标识。`,
  ].join("\n");
}
