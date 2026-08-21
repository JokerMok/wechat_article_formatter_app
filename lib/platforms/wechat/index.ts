import type { StyleTemplate, TemplateKey } from "../../article-types";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../../content";
import type { PlatformVersion, PlatformVersionStatus } from "../types";
import {
  collectWechatImageNodes,
  renderWechatBlockHtml,
  renderWechatContentHtml,
  type WechatImageNode,
  type WechatRenderOptions,
} from "../../renderers/wechat";
import { styleTemplates } from "../../style-templates";

export type WechatPlatformBlock = {
  id: string;
  sourceType: UnifiedArticleBlock["type"];
  text: string;
  html: string;
};

export type WechatPlatformContent = {
  schemaVersion: 1;
  platform: "wechat";
  rendererVersion: 1;
  templateKey: TemplateKey;
  title?: string;
  sourceFormat: UnifiedArticleContent["sourceFormat"];
  parseMode: UnifiedArticleContent["parseMode"];
  blocks: WechatPlatformBlock[];
  html: string;
  text: string;
  images: WechatImageNode[];
  warnings: UnifiedArticleContent["warnings"];
};

export type CreateWechatPlatformVersionOptions = WechatRenderOptions & {
  template?: StyleTemplate;
  status?: PlatformVersionStatus;
  title?: string;
  updatedAt?: string;
};

function blockText(block: UnifiedArticleBlock) {
  if (block.type === "list") {
    return block.items.join("\n");
  }
  if (block.type === "card") {
    return block.title ? `${block.title}：${block.body}` : block.body;
  }
  return block.text;
}

function createSummary(blocks: UnifiedArticleBlock[]) {
  const summaryBlock = blocks.find((block) => block.type === "lead" || block.type === "paragraph" || block.type === "summary");
  const text = summaryBlock ? blockText(summaryBlock).replace(/\s+/g, " ").trim() : "";
  return text ? text.slice(0, 120) : undefined;
}

function createHighlights(blocks: UnifiedArticleBlock[]) {
  const highlights = blocks
    .filter((block) => block.type === "section" || block.type === "subsection" || block.type === "quote")
    .map((block) => blockText(block).trim())
    .filter(Boolean)
    .slice(0, 3);

  return highlights.length ? highlights : undefined;
}

export function createWechatPlatformContent(content: UnifiedArticleContent, options: CreateWechatPlatformVersionOptions = {}): WechatPlatformContent {
  const template = options.template ?? styleTemplates.zhenyiKnowledgeMinimal;
  const renderOptions = { template, imageNodes: options.imageNodes };
  let imageOrdinal = 0;

  return {
    schemaVersion: 1,
    platform: "wechat",
    rendererVersion: 1,
    templateKey: template.key,
    title: content.title,
    sourceFormat: content.sourceFormat,
    parseMode: content.parseMode,
    blocks: content.blocks.map((block, index) => {
      const currentImageOrdinal = imageOrdinal;
      if (block.type === "image") {
        imageOrdinal += 1;
      }

      return {
        id: block.id,
        sourceType: block.type,
        text: blockText(block),
        html: renderWechatBlockHtml(block, template, index, renderOptions, currentImageOrdinal),
      };
    }),
    html: renderWechatContentHtml(content, renderOptions),
    text: content.blocks.map(blockText).join("\n"),
    images: collectWechatImageNodes(content.blocks, options.imageNodes),
    warnings: content.warnings.map((warning) => ({ ...warning, source: warning.source ? { ...warning.source } : undefined })),
  };
}

export function createWechatPlatformVersion(
  content: UnifiedArticleContent,
  options: CreateWechatPlatformVersionOptions = {}
): PlatformVersion<WechatPlatformContent> {
  const wechatContent = createWechatPlatformContent(content, options);

  return {
    platform: "wechat",
    status: options.status ?? "generated",
    title: options.title ?? content.title ?? "",
    content: wechatContent,
    summary: createSummary(content.blocks),
    highlights: createHighlights(content.blocks),
    updatedAt: options.updatedAt ?? new Date().toISOString(),
  };
}
