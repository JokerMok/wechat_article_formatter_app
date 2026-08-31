import type { TemplateKey } from "@/lib/article-types";
import type { UnifiedArticleContent } from "@/lib/content";
import type { DesignPlan } from "@/lib/design-plan";
import type { ContentLayoutId, DesignSchemeId, VisualThemeId } from "@/lib/design-schemes";
import type { PlatformId, PlatformVersionStatus } from "@/lib/platforms/types";
import type { CardAspectRatio, CardLayoutPage } from "@/lib/renderers/cards";
import type { ProjectAssetReference } from "@/lib/storage";

export type WorkspaceMode = "source" | "editor" | "preview";

export type RatioMode = CardAspectRatio;

export type LayoutSettings = {
  ratio: RatioMode;
  margin: number;
  lineSpacing: number;
  paragraphSpacing: number;
  titleSpacing: number;
  titleFontSize: number;
  headingFontSize: number;
  bodyFontSize: number;
  focusFontSize: number;
};

export type AssetPlaceholder = {
  id: ProjectAssetReference["id"];
  fileName: ProjectAssetReference["fileName"];
  mimeType: ProjectAssetReference["mimeType"];
  byteLength: ProjectAssetReference["byteLength"];
  objectUrl?: string;
};

export type DraftHistory = {
  past: PlatformDraft[];
  future: PlatformDraft[];
};

export type PlatformMeta = {
  body?: string;
  caption?: string;
  intro?: string;
  ending?: string;
  highlights?: string[];
  tags: string[];
};

export type PlatformDraft = {
  platform: PlatformId;
  status: PlatformVersionStatus;
  sourceRevision: string;
  schemeId: DesignSchemeId;
  themeId?: VisualThemeId;
  layoutId?: ContentLayoutId;
  title: string;
  content: UnifiedArticleContent;
  templateKey: TemplateKey;
  ratio: RatioMode;
  meta: PlatformMeta;
  lockedPageIds: string[];
  manualPages: CardLayoutPage[];
  editedWechatHtml?: string;
  updatedAt: string;
};

export type AiWorkspaceSettings = {
  mode: "deterministic" | "hosted" | "custom";
  baseUrl: string;
  model: string;
  lastFallbackReason?: string;
};

export type WorkspacePersistedState = {
  schemaVersion: 1;
  sourceMarkdown: string;
  sourceRevision: string;
  designPlan: DesignPlan;
  favoriteSchemeIds: DesignSchemeId[];
  recentSchemeIds: DesignSchemeId[];
  layout: LayoutSettings;
  ai: AiWorkspaceSettings;
  platforms: Record<PlatformId, PlatformDraft>;
};

export type WorkspaceProjectState = WorkspacePersistedState & {
  projectId: string;
  projectTitle: string;
  article: UnifiedArticleContent;
  assets: ProjectAssetReference[];
};

export type UnifiedDraft = {
  content: UnifiedArticleContent;
};
