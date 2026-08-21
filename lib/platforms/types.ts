import type { UnifiedArticleContent } from "../content";

export type PlatformId = "wechat" | "xiaohongshu" | "douyinImage" | "douyinLongform";

export type PlatformVersionStatus = "draft" | "generated" | "edited" | "locked" | "error";

export type PlatformVersion<TContent = UnifiedArticleContent> = {
  platform: PlatformId;
  status: PlatformVersionStatus;
  title: string;
  content: TContent;
  summary?: string;
  highlights?: string[];
  tags?: string[];
  cover?: {
    imageId?: string;
    title?: string;
    subtitle?: string;
  };
  error?: string;
  lockedBlockIds?: string[];
  updatedAt: string;
};

export type PlatformVersionMap<TContent = UnifiedArticleContent> = Partial<Record<PlatformId, PlatformVersion<TContent>>>;
