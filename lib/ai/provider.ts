import { z } from "zod";
import { parseArticleContent } from "../article-parser";
import type { UnifiedArticleBlock, UnifiedArticleContent } from "../content";
import { unifiedArticleContentSchema } from "../content";
import type { PlatformId, PlatformVersion, PlatformVersionMap } from "../platforms/types";

export const aiPlatformIds = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] as const;

const platformIdSchema = z.enum(aiPlatformIds);

const generatedPlatformDraftSchema = z.strictObject({
  platform: platformIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  highlights: z.array(z.string().min(1)).min(1).max(8),
  tags: z.array(z.string().min(1)).max(8),
  cover: z
    .strictObject({
      imageId: z.string().min(1).optional(),
      title: z.string().min(1).optional(),
      subtitle: z.string().min(1).optional(),
    })
    .optional(),
  content: unifiedArticleContentSchema,
});

const generatedResponseSchema = z.strictObject({
  schemaVersion: z.literal(1),
  drafts: z.array(generatedPlatformDraftSchema).min(1).max(aiPlatformIds.length),
});

const openAIChatCompletionSchema = z.object({
  id: z.string().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      })
    )
    .min(1),
});

export type AIErrorCode = "timeout" | "rate_limit" | "cancelled" | "transport" | "schema";

export type AIDiagnostics = {
  provider: "openai-compatible";
  model: string;
  sourceVersionId?: string;
  endpoint?: string;
  status?: number;
  requestId?: string;
  errorCode?: AIErrorCode;
  errorType?: string;
  details?: string[];
};

export type AIChangeKind = "added" | "removed" | "rewritten";

export type AIChangeField = "title" | "summary" | "highlights" | "tags" | "cover" | "content";

export type AIChangeMetadata = {
  textLength?: number;
  itemCount?: number;
  blockCount?: number;
  fieldCount?: number;
};

export type AIChangeRecord = {
  platform: PlatformId;
  field: AIChangeField;
  kind: AIChangeKind;
  before?: AIChangeMetadata;
  after?: AIChangeMetadata;
};

export type AIProviderErrorInfo = {
  code: AIErrorCode;
  message: string;
  retryable: boolean;
  diagnostics: AIDiagnostics;
};

export type GeneratedPlatformDraft = z.infer<typeof generatedPlatformDraftSchema>;

export type GeneratedPlatformResponse = z.infer<typeof generatedResponseSchema>;

export type GeneratePlatformVersionsOptions = {
  provider?: AIProvider;
  source: UnifiedArticleContent;
  sourceVersionId?: string;
  platforms?: PlatformId[];
  existingVersions?: PlatformVersionMap;
  signal?: AbortSignal;
  now?: () => string;
};

export type GeneratePlatformVersionsResult =
  | {
      ok: true;
      versions: PlatformVersionMap;
      diagnostics: AIDiagnostics;
      changes: AIChangeRecord[];
    }
  | {
      ok: false;
      versions: PlatformVersionMap;
      fallbackVersions: PlatformVersionMap;
      error: AIProviderErrorInfo;
    };

export type OpenAICompatibleProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  chatCompletionsPath?: string;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
};

export type ProviderGenerateOptions = {
  source: UnifiedArticleContent;
  sourceVersionId?: string;
  platforms: PlatformId[];
  signal?: AbortSignal;
};

export type ProviderGenerateResult = {
  response: GeneratedPlatformResponse;
  diagnostics: AIDiagnostics;
};

export interface AIProvider {
  readonly model: string;
  generate(options: ProviderGenerateOptions): Promise<ProviderGenerateResult>;
}

export class AIProviderError extends Error {
  readonly code: AIErrorCode;
  readonly retryable: boolean;
  readonly diagnostics: AIDiagnostics;

  constructor(info: AIProviderErrorInfo) {
    super(info.message);
    this.name = "AIProviderError";
    this.code = info.code;
    this.retryable = info.retryable;
    this.diagnostics = info.diagnostics;
  }
}

export class OpenAICompatibleProvider {
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens?: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OpenAICompatibleProviderConfig) {
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.endpoint = buildChatCompletionsUrl(config.baseUrl, config.chatCompletionsPath);
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.maxOutputTokens = config.maxOutputTokens;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async generate(options: ProviderGenerateOptions): Promise<ProviderGenerateResult> {
    const diagnostics = this.baseDiagnostics(options.sourceVersionId);
    const abortController = new AbortController();
    let abortKind: "timeout" | "cancelled" | undefined;

    const cancelFromCaller = () => {
      if (abortKind) {
        return;
      }
      abortKind = "cancelled";
      if (!abortController.signal.aborted) {
        abortController.abort(new Error("AI request cancelled"));
      }
    };

    if (options.signal?.aborted) {
      throw this.error("cancelled", "AI request was cancelled.", false, diagnostics);
    }

    options.signal?.addEventListener("abort", cancelFromCaller, { once: true });
    const timeoutId = setTimeout(() => {
      if (abortKind === "cancelled" || options.signal?.aborted) {
        return;
      }
      abortKind = "timeout";
      abortController.abort(new Error("AI request timed out"));
    }, this.timeoutMs);

    try {
      const throwIfAborted = () => {
        if (abortKind === "timeout") {
          throw this.error("timeout", "AI provider request timed out.", true, diagnostics);
        }
        if (abortKind === "cancelled" || options.signal?.aborted) {
          throw this.error("cancelled", "AI request was cancelled.", false, diagnostics);
        }
      };

      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildRequestBody(options.source, options.platforms)),
        signal: abortController.signal,
      });
      throwIfAborted();

      const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-openai-request-id") ?? undefined;
      const responseDiagnostics = { ...diagnostics, status: response.status, requestId };
      if (response.status === 429) {
        const rateLimitBody = await readCompactErrorBody(response);
        throwIfAborted();
        throw this.error("rate_limit", "AI provider rate limit exceeded.", true, {
          ...responseDiagnostics,
          errorType: rateLimitBody.errorType,
        });
      }
      if (!response.ok) {
        throw this.error("transport", "AI provider request failed.", true, responseDiagnostics);
      }

      const completion = await parseJsonResponse(response, responseDiagnostics, (info) => this.error("transport", info, true, responseDiagnostics));
      throwIfAborted();
      const envelope = openAIChatCompletionSchema.safeParse(completion);
      if (!envelope.success) {
        throw this.schemaError(["OpenAI-compatible response envelope is invalid."], responseDiagnostics);
      }

      const content = envelope.data.choices[0]?.message.content;
      const parsedContent = parseAssistantJson(content);
      if (!parsedContent.ok) {
        throw this.schemaError(["Assistant content is not valid JSON."], responseDiagnostics);
      }

      const sanitized = sanitizeGeneratedResponse(parsedContent.value, options.source.parseMode);
      const generated = generatedResponseSchema.safeParse(sanitized);
      if (!generated.success) {
        throw this.schemaError(compactZodIssues(generated.error), responseDiagnostics);
      }

      return {
        response: generated.data,
        diagnostics: responseDiagnostics,
      };
    } catch (error) {
      if (abortKind === "timeout") {
        throw this.error("timeout", "AI provider request timed out.", true, diagnostics);
      }
      if (abortKind === "cancelled" || options.signal?.aborted) {
        throw this.error("cancelled", "AI request was cancelled.", false, diagnostics);
      }
      if (error instanceof AIProviderError) {
        throw error;
      }
      throw this.error("transport", "AI provider request failed.", true, diagnostics);
    } finally {
      clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", cancelFromCaller);
    }
  }

  private buildRequestBody(source: UnifiedArticleContent, platforms: PlatformId[]) {
    return {
      model: this.model,
      temperature: 0.2,
      ...(this.maxOutputTokens ? { max_tokens: this.maxOutputTokens } : {}),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON with schemaVersion:1 and drafts[]. Each draft must include platform, title, summary, highlights, tags, optional cover, and content. content should be a UnifiedArticleContent object with schemaVersion, sourceText, sourceFormat, parseMode, blocks, and warnings; if producing that object is difficult, content may be plain article text and the server will parse it. Do not add facts that are not supported by the source article.",
        },
        {
          role: "user",
          content: JSON.stringify({
            platforms,
            source,
          }),
        },
      ],
    };
  }

  private baseDiagnostics(sourceVersionId?: string): AIDiagnostics {
    return {
      provider: "openai-compatible",
      model: this.model,
      sourceVersionId,
      endpoint: endpointOrigin(this.endpoint),
    };
  }

  private schemaError(details: string[], diagnostics: AIDiagnostics) {
    return this.error("schema", "AI provider returned an invalid structured response.", false, {
      ...diagnostics,
      errorCode: "schema",
      details,
    });
  }

  private error(code: AIErrorCode, message: string, retryable: boolean, diagnostics: AIDiagnostics) {
    return new AIProviderError({
      code,
      message,
      retryable,
      diagnostics: {
        ...diagnostics,
        errorCode: code,
      },
    });
  }
}

export async function generatePlatformVersions(options: GeneratePlatformVersionsOptions): Promise<GeneratePlatformVersionsResult> {
  const platforms = options.platforms ?? [...aiPlatformIds];
  const now = options.now?.() ?? new Date().toISOString();
  const fallbackVersions = buildFallbackPlatformVersions(options.source, platforms, now);
  const currentVersions = options.existingVersions ?? {};

  if (!options.provider) {
    return {
      ok: false,
      versions: currentVersions,
      fallbackVersions,
      error: {
        code: "transport",
        message: "AI provider is not configured.",
        retryable: false,
        diagnostics: {
          provider: "openai-compatible",
          model: "none",
          sourceVersionId: options.sourceVersionId,
          errorCode: "transport",
        },
      },
    };
  }

  try {
    const generated = await options.provider.generate({
      source: options.source,
      sourceVersionId: options.sourceVersionId,
      platforms,
      signal: options.signal,
    });
    const versions = buildGeneratedPlatformVersions(generated.response.drafts, platforms, options.source, now);
    const baselineVersions = platforms.reduce<PlatformVersionMap>((baseline, platform) => {
      baseline[platform] = currentVersions[platform] ?? fallbackVersions[platform];
      return baseline;
    }, {});

    return {
      ok: true,
      versions,
      diagnostics: generated.diagnostics,
      changes: buildPlatformChangeRecords(platforms, baselineVersions, versions),
    };
  } catch (error) {
    return {
      ok: false,
      versions: currentVersions,
      fallbackVersions,
      error: normalizeAIError(error, options.provider.model, options.sourceVersionId),
    };
  }
}

export function buildFallbackPlatformVersions(source: UnifiedArticleContent, platforms: PlatformId[], updatedAt: string): PlatformVersionMap {
  const title = firstNonEmpty(source.title, source.blocks.find((block) => block.type === "title")?.text, "未命名文章");
  const bodyBlocks = source.blocks.filter((block) => block.type !== "title");
  const summarySource = firstNonEmpty(...bodyBlocks.map(blockPlainText), source.sourceText, title);
  const highlights = bodyBlocks.map(blockPlainText).filter(Boolean).slice(0, 3);

  return platforms.reduce<PlatformVersionMap>((versions, platform) => {
    const summary = truncateText(summarySource, platformSummaryLength(platform));
    const safeHighlights = highlights.length > 0 ? [...highlights] : [summary];
    const cover = platform === "douyinImage" ? { title: platformTitle(platform, title), subtitle: summary } : undefined;
    versions[platform] = {
      platform,
      status: "draft",
      title: platformTitle(platform, title),
      content: cloneUnifiedArticleContent(source),
      summary,
      highlights: safeHighlights,
      tags: [...fallbackTags(platform)],
      cover: cover ? { ...cover } : undefined,
      updatedAt,
    };
    return versions;
  }, {});
}

export function buildPlatformChangeRecords(
  platforms: PlatformId[],
  previousVersions: Partial<Record<PlatformId, PlatformVersion<unknown>>>,
  nextVersions: Partial<Record<PlatformId, PlatformVersion<unknown>>>
): AIChangeRecord[] {
  const fields: AIChangeField[] = ["title", "summary", "highlights", "tags", "cover", "content"];

  return platforms.flatMap((platform) => {
    const previous = previousVersions[platform];
    const next = nextVersions[platform];

    return fields.flatMap((field) => {
      const beforeValue = platformFieldValue(previous, field);
      const afterValue = platformFieldValue(next, field);
      const before = changeMetadata(field, beforeValue);
      const after = changeMetadata(field, afterValue);
      let kind: AIChangeKind | undefined;

      if (beforeValue === undefined && afterValue !== undefined) {
        kind = "added";
      } else if (beforeValue !== undefined && afterValue === undefined) {
        kind = "removed";
      } else if (!sameValue(beforeValue, afterValue)) {
        kind = "rewritten";
      }

      return kind ? [{ platform, field, kind, before, after }] : [];
    });
  });
}

export function validateGeneratedFacts(generatedText: string, source: UnifiedArticleContent) {
  const sourceText = sourceSupportedText(source);
  const unsupportedNumbers = unique(extractNumbers(generatedText).filter((number) => !sourceText.includes(number)));
  const unsupportedQuotes = unique(extractQuotedClaims(generatedText).filter((quote) => !sourceText.includes(quote)));

  return {
    unsupportedNumbers,
    unsupportedQuotes,
    ok: unsupportedNumbers.length === 0 && unsupportedQuotes.length === 0,
  };
}

function buildGeneratedPlatformVersions(
  drafts: GeneratedPlatformDraft[],
  platforms: PlatformId[],
  source: UnifiedArticleContent,
  updatedAt: string
): PlatformVersionMap {
  const byPlatform = new Map(drafts.map((draft) => [draft.platform, draft]));
  const versions: PlatformVersionMap = {};

  for (const platform of platforms) {
    const draft = byPlatform.get(platform);
    if (!draft) {
      throw new AIProviderError({
        code: "schema",
        message: "AI provider response is missing a requested platform.",
        retryable: false,
        diagnostics: {
          provider: "openai-compatible",
          model: "unknown",
          errorCode: "schema",
          details: [`missing platform: ${platform}`],
        },
      });
    }

    const factCheck = validateGeneratedFacts(generatedFactText(draft), source);
    if (!factCheck.ok) {
      const details = [
        factCheck.unsupportedNumbers.length > 0 ? `unsupported_number_count:${factCheck.unsupportedNumbers.length}` : undefined,
        factCheck.unsupportedQuotes.length > 0 ? `unsupported_quote_count:${factCheck.unsupportedQuotes.length}` : undefined,
      ].filter((detail): detail is string => Boolean(detail));

      throw new AIProviderError({
        code: "schema",
        message: "AI provider response contains unsupported factual details.",
        retryable: false,
        diagnostics: {
          provider: "openai-compatible",
          model: "unknown",
          errorCode: "schema",
          details,
        },
      });
    }

    versions[platform] = {
      platform,
      status: "generated",
      title: draft.title,
      content: draft.content,
      summary: draft.summary,
      highlights: draft.highlights,
      tags: draft.tags,
      cover: draft.cover,
      updatedAt,
    };
  }

  return versions;
}

type PlatformVersionValue = PlatformVersion<unknown>;

function platformFieldValue(version: PlatformVersionValue | undefined, field: AIChangeField) {
  if (!version) {
    return undefined;
  }
  return version[field];
}

function changeMetadata(field: AIChangeField, value: unknown): AIChangeMetadata | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (field === "title" || field === "summary") {
    return { textLength: typeof value === "string" ? value.length : 0 };
  }
  if (field === "highlights" || field === "tags") {
    const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return { itemCount: values.length, textLength: values.reduce((total, item) => total + item.length, 0) };
  }
  if (field === "cover") {
    const cover = isRecord(value) ? value : {};
    const textLength = Object.values(cover).reduce<number>(
      (total, item) => total + (typeof item === "string" ? item.length : 0),
      0
    );
    return { fieldCount: Object.keys(cover).length, textLength };
  }

  return contentMetadata(value);
}

function contentMetadata(value: unknown): AIChangeMetadata {
  if (!isRecord(value)) {
    return { blockCount: 0, textLength: 0 };
  }

  const blocks = Array.isArray(value.blocks) ? value.blocks : [];
  return {
    blockCount: blocks.length,
    textLength: blocks.reduce((total, block) => total + blockTextLength(block), 0),
  };
}

function blockTextLength(block: unknown) {
  if (!isRecord(block)) {
    return 0;
  }

  const directText = firstString(block.plainText, block.text, block.markdown, block.html, block.alt, block.title, block.body);
  if (directText !== undefined) {
    return directText.length;
  }

  if (Array.isArray(block.items)) {
    return block.items.reduce((total, item) => total + (typeof item === "string" ? item.length : 0), 0);
  }

  return 0;
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string");
}

function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeAIError(error: unknown, model: string, sourceVersionId?: string): AIProviderErrorInfo {
  if (error instanceof AIProviderError || isAIProviderErrorLike(error)) {
    const providerError = error as Pick<AIProviderError, "code" | "message" | "retryable" | "diagnostics">;
    return {
      code: providerError.code,
      message: providerError.message,
      retryable: providerError.retryable,
      diagnostics: {
        ...providerError.diagnostics,
        model: providerError.diagnostics.model === "unknown" ? model : providerError.diagnostics.model,
        sourceVersionId: providerError.diagnostics.sourceVersionId ?? sourceVersionId,
      },
    };
  }

  return {
    code: "transport",
    message: "AI provider request failed.",
    retryable: true,
    diagnostics: {
      provider: "openai-compatible",
      model,
      sourceVersionId,
      errorCode: "transport",
    },
  };
}

function isAIProviderErrorLike(error: unknown): error is Pick<AIProviderError, "code" | "message" | "retryable" | "diagnostics"> {
  if (!error || typeof error !== "object") return false;
  const value = error as Partial<AIProviderError>;
  return Boolean(value.code && value.message && value.diagnostics && typeof value.retryable === "boolean");
}

export function buildChatCompletionsUrl(baseUrl: string, chatCompletionsPath = "/chat/completions") {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const path = `/${chatCompletionsPath.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  return trimmed.endsWith(path) ? trimmed : `${trimmed}${path}`;
}

function endpointOrigin(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.origin;
  } catch {
    return "invalid-url";
  }
}

async function parseJsonResponse(response: Response, diagnostics: AIDiagnostics, onError: (message: string) => AIProviderError) {
  try {
    return await response.json();
  } catch {
    throw onError(`Provider returned non-JSON HTTP response (${diagnostics.status ?? "unknown"}).`);
  }
}

async function readCompactErrorBody(response: Response) {
  try {
    const body = await response.json();
    if (typeof body === "object" && body && "error" in body) {
      const error = (body as { error?: { type?: unknown; code?: unknown } }).error;
      return {
        errorType: safeDiagnosticToken(error?.type) ?? safeDiagnosticToken(error?.code),
      };
    }
  } catch {
    return {};
  }
  return {};
}

function parseAssistantJson(content: string) {
  try {
    return { ok: true as const, value: JSON.parse(content) as unknown };
  } catch {
    return { ok: false as const };
  }
}

function sanitizeGeneratedResponse(value: unknown, parseMode: UnifiedArticleContent["parseMode"]): unknown {
  if (!isRecord(value) || !Array.isArray(value.drafts)) {
    return value;
  }

  return {
    ...value,
    drafts: value.drafts.map((draft) => sanitizeGeneratedDraft(draft, parseMode)),
  };
}

function sanitizeGeneratedDraft(value: unknown, parseMode: UnifiedArticleContent["parseMode"]): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const title = sanitizeTextValue(value.title);
  const summary = sanitizeTextValue(value.summary);
  const content = sanitizeArticleContent(value.content, parseMode, typeof title === "string" ? title : undefined);
  const highlights = sanitizeTextArray(value.highlights);
  const fallbackHighlights = contentTextValues(content).slice(0, 3);
  return {
    ...value,
    title,
    summary,
    highlights: highlights.length > 0 ? highlights : fallbackHighlights.length > 0 ? fallbackHighlights : typeof summary === "string" && summary ? [summary] : highlights,
    tags: sanitizeTextArray(value.tags),
    cover: isRecord(value.cover)
      ? {
          ...value.cover,
          imageId: sanitizeTextValue(value.cover.imageId),
          title: sanitizeTextValue(value.cover.title),
          subtitle: sanitizeTextValue(value.cover.subtitle),
        }
      : value.cover,
    content,
  };
}

function sanitizeArticleContent(value: unknown, parseMode: UnifiedArticleContent["parseMode"], title?: string): unknown {
  if (typeof value === "string") {
    const text = sanitizeGeneratedText(value);
    return parseGeneratedTextContent(text, parseMode, title);
  }
  if (!isRecord(value)) {
    return value;
  }
  const sanitized = sanitizeUnknownStrings(value);
  if (isRecord(sanitized) && Array.isArray(sanitized.blocks) && sanitized.blocks.length === 0) {
    const sourceText = typeof sanitized.sourceText === "string" ? sanitized.sourceText.trim() : "";
    return parseGeneratedTextContent(sourceText, parseMode, title);
  }
  return sanitized;
}

function parseGeneratedTextContent(text: string, parseMode: UnifiedArticleContent["parseMode"], title?: string) {
  const firstLine = text.split("\n").find((line) => line.trim().length > 0)?.trim() ?? "";
  const hasHeading = /^#{1,6}\s+\S/.test(firstLine);
  const hasTitleLine = Boolean(title && firstLine === title.trim());
  const sourceText = title && !hasHeading && !hasTitleLine ? `# ${title}\n\n${text}` : text || (title ? `# ${title}` : "");
  return parseArticleContent(sourceText, { mode: parseMode });
}

function contentTextValues(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.blocks)) {
    return [];
  }
  return value.blocks
    .map((block) => {
      if (!isRecord(block)) {
        return "";
      }
      if (typeof block.plainText === "string") {
        return block.plainText.trim();
      }
      return typeof block.text === "string" ? block.text.trim() : "";
    })
    .filter(Boolean);
}

function sanitizeUnknownStrings(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeGeneratedText(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeUnknownStrings);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeUnknownStrings(item)]));
  }
  return value;
}

function sanitizeTextValue(value: unknown) {
  return typeof value === "string" ? sanitizeGeneratedText(value) : value;
}

function sanitizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(sanitizeTextValue).filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function sanitizeGeneratedText(text: string) {
  return text
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:[^\s"'<>]*/gi, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function generatedFactText(draft: GeneratedPlatformDraft) {
  return [
    draft.title,
    draft.summary,
    ...draft.highlights,
    ...draft.tags,
    draft.cover?.title,
    draft.cover?.subtitle,
    ...draft.content.blocks.map(blockPlainText),
  ]
    .filter(Boolean)
    .join("\n");
}

function sourceSupportedText(source: UnifiedArticleContent) {
  return [source.sourceText, source.title, ...source.blocks.map(blockPlainText)].filter(Boolean).join("\n");
}

function blockPlainText(block: UnifiedArticleBlock) {
  return block.plainText;
}

function cloneUnifiedArticleContent(content: UnifiedArticleContent): UnifiedArticleContent {
  return structuredClone(content);
}

function extractNumbers(text: string) {
  const matches = text.match(/\d+(?:[.,]\d+)?%?/g) ?? [];
  return matches.map((match) => match.replace(/%$/, ""));
}

function extractQuotedClaims(text: string) {
  const claims: string[] = [];
  const pattern = /[“"']([^”"']{6,})[”"']/g;
  let match = pattern.exec(text);
  while (match) {
    claims.push(match[1]);
    match = pattern.exec(text);
  }
  return claims;
}

function firstNonEmpty(...values: Array<string | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim() ?? "";
}

function platformTitle(platform: PlatformId, title: string) {
  if (platform === "douyinImage") {
    return truncateText(title, 18);
  }
  if (platform === "xiaohongshu") {
    return truncateText(title, 28);
  }
  return truncateText(title, 42);
}

function platformSummaryLength(platform?: PlatformId) {
  if (platform === "douyinImage") {
    return 42;
  }
  if (platform === "xiaohongshu") {
    return 80;
  }
  return 120;
}

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function fallbackTags(platform: PlatformId) {
  if (platform === "xiaohongshu") {
    return ["自媒体", "内容整理"];
  }
  if (platform === "douyinImage") {
    return ["图文", "内容整理"];
  }
  if (platform === "douyinLongform") {
    return ["长文", "内容整理"];
  }
  return ["公众号", "内容整理"];
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactZodIssues(error: z.ZodError) {
  return error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.map(safePathSegment).join(".") || "response";
    return `schema_issue path=${path} code=${issue.code}`;
  });
}

function safePathSegment(segment: PropertyKey) {
  const value = String(segment);
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? value : "field";
}

function safeDiagnosticToken(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  return /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : "redacted";
}
