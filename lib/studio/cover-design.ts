import { z } from "zod";

export const coverPromptMaxLength = 2400;

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
  headline: coverLine.min(1).max(90),
  subtitle: coverLine.max(120),
  concept: z.string().trim().min(15).max(320),
  composition: z.string().trim().min(15).max(240),
  typography: z.string().trim().min(10).max(180),
  finish: z.string().trim().min(12).max(220),
}).strict();

type CoverDesign = z.infer<typeof coverDesignSchema>;

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
  const { headline, subtitle } = design;
  const exactCopy = (line: string) =>
    [`「${line}」`, `『${line}』`, `“${line}”`, `"${line}"`].some((quote) => brief.includes(quote));
  const title = normalizedCopy(articleTitle);
  const main = normalizedCopy(headline);
  const support = normalizedCopy(subtitle);
  if (!main || (support && main === support))
    return "主标题须有实际文案，副标题不得复述主标题。";

  const copiesLongTitle = title.length > 0 && visualLength(articleTitle) > 12 &&
    [main, support, main + support].some((line) => line.length >= title.length * 0.8 && title.includes(line));
  if (copiesLongTitle && !exactCopy(headline) && (!subtitle || !exactCopy(subtitle)))
    return "文案仍在复述或拆分长篇原题。提炼文章的独到发现，重新写封面主标题。";
  if ((!exactCopy(headline) && visualLength(headline) > 16) ||
      (subtitle && !exactCopy(subtitle) && visualLength(subtitle) > 26))
    return "文案超过缩略图可读的字量。缩短主标题，副标题只保留一个有用的补充。";
}

export function composeCoverPrompt(design: CoverDesign, width: number, height: number) {
  const { size, safeWidth, safeHeight } = coverImageFrame(width, height);
  return [
    `为 ${width} × ${height} 的最终裁切制作一张完整的编辑封面。`,
    `\n画面文案\n只在图中绘制以下文案，逐字保留。\n主标题「${design.headline}」`,
    ...(design.subtitle ? [`副标题「${design.subtitle}」`] : []),
    `\n画面构思\n${design.concept}`,
    `\n构图与留白\n${design.composition}`,
    `\n色彩与质感\n${design.finish}`,
    `\n文字排版\n${design.typography}`,
    `\n交付\n以 ${size.replace("x", " × ")} 的生图画布构图。文字与视觉焦点放在画布中央 ${safeWidth}% 宽、${safeHeight}% 高的区域，背景延伸到画布四边。避免额外文字、水印和无关标识。`,
  ].join("\n");
}
