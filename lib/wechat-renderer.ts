import type { ArticleBlock, StyleTemplate } from "./article-types";
import type { UnifiedArticleContent } from "./content";
import {
  renderUnifiedWechatHtml,
  renderWechatBlocksHtml,
  renderWechatContent,
  renderWechatContentHtml,
  type WechatImageNode,
  type WechatRenderOptions,
  type WechatRenderResult,
} from "./renderers/wechat";

export type { WechatImageNode, WechatRenderOptions, WechatRenderResult };

export { renderUnifiedWechatHtml, renderWechatContent, renderWechatContentHtml };

export function renderWechatHtml(blocks: ArticleBlock[], template: StyleTemplate): string;
export function renderWechatHtml(content: UnifiedArticleContent, template: StyleTemplate): string;
export function renderWechatHtml(contentOrBlocks: ArticleBlock[] | UnifiedArticleContent, template: StyleTemplate) {
  if (Array.isArray(contentOrBlocks)) {
    return renderWechatBlocksHtml(contentOrBlocks, { template });
  }

  return renderWechatContentHtml(contentOrBlocks, { template });
}
