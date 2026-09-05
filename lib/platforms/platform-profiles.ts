import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import type { PlatformId } from "./types";

const PLATFORM_PROFILE_SCHEMA_VERSION = 1;
const PLATFORM_OUTPUT_SCHEMA_VERSION = 1;

export type DouyinImageAspectRatio = "3:4" | "9:16";

type SocialPlatformId = Exclude<PlatformId, "wechat">;

export type PlatformSourceReference = {
  blockId: string;
  startLine: number;
  endLine: number;
  sourceText: string;
};

export type RenderableBlock = {
  blockId: string;
  kind: UnifiedArticleBlock["type"];
  text: string;
  source: PlatformSourceReference;
};

export type PlatformSourceTrace = {
  sourceSchemaVersion: UnifiedArticleContent["schemaVersion"];
  sourceTextFingerprint: string;
  sourceFormat: UnifiedArticleContent["sourceFormat"];
  sourceTitle: string;
  blockIds: string[];
  blockCount: number;
};

export type PlatformProfileCommon = {
  platform: SocialPlatformId;
  profileName: string;
  profileVersion: `${number}.${number}.${number}`;
  profileSchemaVersion: typeof PLATFORM_PROFILE_SCHEMA_VERSION;
  outputSchemaVersion: typeof PLATFORM_OUTPUT_SCHEMA_VERSION;
  sourceTraceVersion: 1;
  maxTags: number;
};

export type XiaohongshuProfile = PlatformProfileCommon & {
  platform: "xiaohongshu";
  preferredPageSize: {
    width: 1080;
    height: 1440;
    ratio: "3:4";
  };
  maxBlocksPerPage: 6;
};

export type DouyinImageProfile = PlatformProfileCommon & {
  platform: "douyinImage";
  defaultAspectRatio: DouyinImageAspectRatio;
  aspectRatios: {
    "3:4": {
      width: 1080;
      height: 1440;
    };
    "9:16": {
      width: 1080;
      height: 1920;
    };
  };
  maxBlocksPerPage: {
    "3:4": 6;
    "9:16": 8;
  };
};

export type DouyinLongformProfile = PlatformProfileCommon & {
  platform: "douyinLongform";
  introTargetWords: number;
  endingTargetWords: number;
};

export type PlatformProfile = XiaohongshuProfile | DouyinImageProfile | DouyinLongformProfile;

export const platformProfiles = {
  xiaohongshu: {
    platform: "xiaohongshu",
    profileName: "小红书图文",
    profileVersion: "1.0.0",
    profileSchemaVersion: PLATFORM_PROFILE_SCHEMA_VERSION,
    outputSchemaVersion: PLATFORM_OUTPUT_SCHEMA_VERSION,
    sourceTraceVersion: 1,
    preferredPageSize: {
      width: 1080,
      height: 1440,
      ratio: "3:4",
    },
    maxBlocksPerPage: 6,
    maxTags: 6,
  },
  douyinImage: {
    platform: "douyinImage",
    profileName: "抖音图文",
    profileVersion: "1.0.0",
    profileSchemaVersion: PLATFORM_PROFILE_SCHEMA_VERSION,
    outputSchemaVersion: PLATFORM_OUTPUT_SCHEMA_VERSION,
    sourceTraceVersion: 1,
    // 9:16 is the default publishing canvas. 3:4 remains an explicit option
    // for accounts that use the alternate feed composition.
    defaultAspectRatio: "9:16",
    aspectRatios: {
      "3:4": {
        width: 1080,
        height: 1440,
      },
      "9:16": {
        width: 1080,
        height: 1920,
      },
    },
    maxBlocksPerPage: {
      "3:4": 6,
      "9:16": 8,
    },
    maxTags: 6,
  },
  douyinLongform: {
    platform: "douyinLongform",
    profileName: "抖音长文",
    profileVersion: "1.0.0",
    profileSchemaVersion: PLATFORM_PROFILE_SCHEMA_VERSION,
    outputSchemaVersion: PLATFORM_OUTPUT_SCHEMA_VERSION,
    sourceTraceVersion: 1,
    introTargetWords: 24,
    endingTargetWords: 24,
    maxTags: 8,
  },
} as const;

export type PlatformProfileId = keyof typeof platformProfiles;

export function getPlatformProfile(platform: PlatformProfileId): PlatformProfile {
  return platformProfiles[platform];
}

export function resolveDouyinImageRatio(value: unknown, profile: DouyinImageProfile): DouyinImageAspectRatio {
  const candidate = value as DouyinImageAspectRatio;
  const isSupported =
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(profile.aspectRatios, value) &&
    Object.prototype.hasOwnProperty.call(profile.maxBlocksPerPage, value) &&
    Number.isFinite(profile.maxBlocksPerPage[candidate]) &&
    profile.maxBlocksPerPage[candidate] >= 1;

  return isSupported ? candidate : profile.defaultAspectRatio;
}

export function stableChecksum(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    hash >>>= 0;
  }

  return hash.toString(16).padStart(8, "0");
}

export function buildSourceTrace(content: UnifiedArticleContent): PlatformSourceTrace {
  return {
    sourceSchemaVersion: content.schemaVersion,
    sourceTextFingerprint: stableChecksum(content.sourceText),
    sourceFormat: content.sourceFormat,
    sourceTitle: content.title?.trim() ?? "",
    blockIds: content.blocks.map((block) => block.id),
    blockCount: content.blocks.length,
  };
}

function normalizeTextValue(value: string) {
  return value.trim();
}

export function renderBlockText(block: UnifiedArticleBlock): string | null {
  if (block.type === "divider" || block.type === "pageBreak") {
    return null;
  }

  if (block.type === "code") {
    return normalizeTextValue(block.text) || null;
  }

  if (block.type === "list") {
    return block.items.map((item, index) => `${index + 1}. ${normalizeTextValue(item)}`).join("\n");
  }

  if (block.type === "card") {
    const title = block.title?.trim();
    if (title) {
      return `${title}：${normalizeTextValue(block.body)}`;
    }
    return normalizeTextValue(block.body);
  }

  return normalizeTextValue(block.text);
}

export function collectRenderableBlocks(content: UnifiedArticleContent): RenderableBlock[] {
  return content.blocks.flatMap((block) => {
    const text = renderBlockText(block);
    if (!text) {
      return [];
    }

    return [
      {
        blockId: block.id,
        kind: block.type,
        text,
        source: {
          blockId: block.id,
          startLine: block.source.startLine,
          endLine: block.source.endLine,
          sourceText: block.source.sourceText,
        },
      },
    ];
  });
}

export function collectRenderablePages(content: UnifiedArticleContent, maxBlocksPerPage: number): RenderableBlock[][] {
  const explicitPages: RenderableBlock[][] = [[]];
  let hasExplicitBreak = false;

  for (const block of content.blocks) {
    if (block.type === "pageBreak") {
      hasExplicitBreak = true;
      if (explicitPages.at(-1)?.length) explicitPages.push([]);
      continue;
    }
    const text = renderBlockText(block);
    if (!text) continue;
    explicitPages.at(-1)?.push({
      blockId: block.id,
      kind: block.type,
      text,
      source: {
        blockId: block.id,
        startLine: block.source.startLine,
        endLine: block.source.endLine,
        sourceText: block.source.sourceText,
      },
    });
  }

  if (!hasExplicitBreak) return paginateBlocks(explicitPages[0] ?? [], maxBlocksPerPage);
  return explicitPages
    .filter((page) => page.length > 0)
    .flatMap((page) => paginateBlocks(page, maxBlocksPerPage));
}

export function selectFallbackTitle(content: UnifiedArticleContent) {
  return (
    content.title?.trim() ||
    content.blocks.find((block) => block.type === "title" && block.text.trim())?.text.trim() ||
    content.blocks.find((block) => block.type === "lead" && block.text.trim())?.text.trim() ||
    content.blocks.find((block) => block.type === "section" && block.text.trim())?.text.trim() ||
    content.blocks.find((block) => block.type === "paragraph" && block.text.trim())?.text.trim() ||
    "未命名文章"
  );
}

export function selectSubtitle(content: UnifiedArticleContent) {
  const lead =
    content.blocks.find((block) => block.type === "lead" && block.text.trim()) ??
    content.blocks.find((block) => block.type === "section" && block.text.trim()) ??
    content.blocks.find((block) => block.type === "paragraph" && block.text.trim());

  return lead?.text.trim() || "";
}

export function summarizeTextBlocks(content: UnifiedArticleContent) {
  const blocks = collectRenderableBlocks(content).map((block) => block.text).filter(Boolean);
  return {
    plainText: blocks.join("\n"),
    blockCount: blocks.length,
  };
}

function splitTokens(value: string) {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/[，。！？；;:：!?.、|]/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

const PUBLISHING_TAG_PATTERNS = [
  "AI产品经理", "产品经理", "企业AI", "人工智能", "项目复盘", "案例复盘", "技术协作", "算法包",
  "训练数据", "模型部署", "数据分析", "数据治理", "知识库", "客户服务", "内容创作", "效率工具",
  "产品设计", "项目管理", "职场成长", "个人成长", "小红书", "公众号", "抖音",
];

export function collectTags(content: UnifiedArticleContent, maxCount: number) {
  const searchableText = content.blocks.map((block) => renderBlockText(block) ?? "").join(" ");
  const domainCandidates = PUBLISHING_TAG_PATTERNS.filter((tag) => searchableText.includes(tag));
  const latinCandidates = [...searchableText.matchAll(/\b(?:AI|[A-Z][A-Za-z0-9.+-]{2,18}|[A-Z]{2,12})\b/g)]
    .map((match) => match[0]);
  const structuralCandidates = content.blocks.flatMap((block): string[] => {
    if (block.type === "title" || block.type === "section" || block.type === "subsection" || block.type === "lead") {
      return splitTokens(block.text);
    }
    if (block.type === "card") {
      if (block.title?.trim()) {
        return [block.title.trim()];
      }
      return splitTokens(block.body);
    }
    return [];
  });
  const tagCandidates = [...domainCandidates, ...latinCandidates, ...structuralCandidates];

  const unique = new Map<string, boolean>();
  const tags: string[] = [];

  for (const candidate of tagCandidates) {
    const clean = candidate
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "")
      .slice(0, 12);
    if (!clean || unique.has(clean)) {
      continue;
    }
    unique.set(clean, true);
    tags.push(clean);
    if (tags.length >= maxCount) {
      break;
    }
  }

  return tags;
}

export function paginateBlocks(blocks: RenderableBlock[], maxBlocksPerPage: number) {
  const pageSize = Number.isFinite(maxBlocksPerPage) ? Math.max(1, Math.floor(maxBlocksPerPage)) : 1;
  if (blocks.length === 0) {
    return [];
  }

  const pages: RenderableBlock[][] = [];
  for (let start = 0; start < blocks.length; start += pageSize) {
    pages.push(blocks.slice(start, start + pageSize));
  }

  return pages;
}
