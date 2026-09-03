import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";

const PUBLISHING_METADATA_HEADINGS = /^(素材类型|目标受众|关联资产|发布边界|发布信息|编辑说明|审核信息|状态|来源)$/;

export function isPublishingMetadataHeading(value: string) {
  return PUBLISHING_METADATA_HEADINGS.test(value.trim());
}

export function isGenericStructureHeading(value: string) {
  return /^(核心信息|内容结构|主要内容|文章结构|正文|背景|目标|总结|结语)$/u.test(value.trim());
}

export function publicationBlocks(content: UnifiedArticleContent) {
  const blocks: UnifiedArticleBlock[] = [];
  let skipSection = false;

  for (const block of content.blocks) {
    if (block.type === "section" || block.type === "subsection") {
      skipSection = isPublishingMetadataHeading(block.text);
      if (skipSection) continue;
    }
    if (skipSection) continue;
    blocks.push(block);
  }

  return blocks;
}

export function cleanPublishingText(value: string) {
  return value
    .replace(/(?:关联(?:方法|资料|资产)?见|参见)\s*\[\[[^\]]+\]\][。.]?/g, "")
    .replace(/\[\[[^|\]]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[[^\]]+\]\]/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^(?:>|＞|&gt;)\s*$/u, "")
    .replace(/^(?:>|＞|&gt;)\s+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWeakPublishingText(value: string) {
  const normalized = cleanPublishingText(value).replace(/\s+/g, "").slice(0, 48);
  return !normalized
    || /^(?:>|＞|&gt;)$/.test(normalized)
    || /^(素材类型|目标受众|关联资产|发布边界|状态为|公众号案例草稿|created:|updated:|tags:|sources:)/i.test(normalized);
}
