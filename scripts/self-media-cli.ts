#!/usr/bin/env node

import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright";
import { applyEditorialPlans, generatePlatformVersions, validateGeneratedFacts, type AIDiagnostics, type AIProvider } from "../lib/ai/provider";
import { analyzeWithServerAI, generateWithServerAI } from "../lib/ai/server/gateway";
import { type UnifiedArticleContent } from "../lib/content";
import { parseSyntaxDocument } from "../lib/content/source-document";
import {
  analyzeArticleDesign,
  applySemanticBlueprint,
  buildPlatformArticle,
  contentBlueprintSchema,
  editorialPlanSchema,
  type ContentBlueprint,
  type DesignPlan,
  type EditorialPlan,
  type GenerationMode,
} from "../lib/design-plan";
import {
  CONTENT_LAYOUT_IDS,
  VISUAL_THEME_IDS,
  createCardPreset,
  type ContentLayoutId,
  type VisualThemeId,
} from "../lib/design-schemes";
import {
  exportDouyinImagePackage,
  exportDouyinLongformText,
  exportWechatHtml,
  exportXiaohongshuPackage,
  type CardPageRenderInput,
  type ExportedFile,
} from "../lib/export";
import { createWechatPlatformContent } from "../lib/platforms/wechat";
import type { PlatformId } from "../lib/platforms/types";
import {
  createApproximateTextMeasurer,
  drawCardImagePage,
  layoutDouyinImagePagesToTarget,
  layoutXiaohongshuPagesToTarget,
  type CardImageCanvasContext,
  type CardLayoutResult,
} from "../lib/renderers/cards";
import { styleTemplates } from "../lib/style-templates";

const PLATFORM_IDS = ["wechat", "xiaohongshu", "douyinImage", "douyinLongform"] as const satisfies readonly PlatformId[];
const PLATFORM_ALIASES: Record<string, PlatformId> = {
  wechat: "wechat",
  xiaohongshu: "xiaohongshu",
  xhs: "xiaohongshu",
  "douyin-image": "douyinImage",
  douyinimage: "douyinImage",
  "douyin-longform": "douyinLongform",
  douyinlongform: "douyinLongform",
};

type CliOptions = {
  input: string;
  output: string;
  platforms: PlatformId[];
  generationMode: GenerationMode;
  themeId?: VisualThemeId;
  layoutId?: ContentLayoutId;
  ratio: "3:4" | "9:16";
  blueprint?: string;
  editorialPlans?: string;
  wechatTemplate?: keyof typeof styleTemplates;
  brand: string;
};

type CardPreset = ReturnType<typeof createCardPreset>;

function usage() {
  return `Usage:
  npm run self-media -- <article.md> [options]

Options:
  -o, --output <dir>            Output directory
  -p, --platform <list>         all, wechat, xiaohongshu, douyin-image, douyin-longform
      --mode <mode>             layout-only (default) or reach-optimized
      --theme <id>              editorial, informationCard, storyMagazine
      --layout <id>             editorial, checklist, data, story
      --ratio <ratio>           3:4 (default) or 9:16 for Douyin image cards
      --blueprint <file>        Host-model semantic blueprint JSON
      --editorial-plans <file>  Reviewed plans JSON or a previous plan.json
      --wechat-template <id>    Template key from lib/style-templates.ts
      --brand <name>            Brand label on image cards
  -h, --help                    Show this help
`;
}

export function parseCliArgs(argv: string[]): CliOptions {
  if (argv.includes("-h") || argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }

  let input = "";
  let output = "";
  let platformValue = "all";
  let generationMode: GenerationMode = "layoutOnly";
  let themeId: VisualThemeId | undefined;
  let layoutId: ContentLayoutId | undefined;
  let ratio: "3:4" | "9:16" = "3:4";
  let blueprint: string | undefined;
  let editorialPlans: string | undefined;
  let wechatTemplate: keyof typeof styleTemplates | undefined;
  let brand = "臻一人工智能实验室";

  const takeValue = (index: number, flag: string) => {
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("-")) {
      if (input) throw new Error(`Unexpected argument: ${arg}`);
      input = arg;
      continue;
    }
    if (arg === "-o" || arg === "--output") output = takeValue(index++, arg);
    else if (arg === "-p" || arg === "--platform") platformValue = takeValue(index++, arg);
    else if (arg === "--mode") {
      const value = takeValue(index++, arg);
      if (value !== "layout-only" && value !== "reach-optimized") throw new Error(`Unsupported mode: ${value}`);
      generationMode = value === "layout-only" ? "layoutOnly" : "reachOptimized";
    } else if (arg === "--theme") {
      const value = takeValue(index++, arg);
      if (!VISUAL_THEME_IDS.includes(value as VisualThemeId)) throw new Error(`Unsupported theme: ${value}`);
      themeId = value as VisualThemeId;
    } else if (arg === "--layout") {
      const value = takeValue(index++, arg);
      if (!CONTENT_LAYOUT_IDS.includes(value as ContentLayoutId)) throw new Error(`Unsupported layout: ${value}`);
      layoutId = value as ContentLayoutId;
    } else if (arg === "--ratio") {
      const value = takeValue(index++, arg);
      if (value !== "3:4" && value !== "9:16") throw new Error(`Unsupported ratio: ${value}`);
      ratio = value;
    } else if (arg === "--blueprint") blueprint = takeValue(index++, arg);
    else if (arg === "--editorial-plans") editorialPlans = takeValue(index++, arg);
    else if (arg === "--brand") brand = takeValue(index++, arg);
    else if (arg === "--wechat-template") {
      const value = takeValue(index++, arg);
      if (!(value in styleTemplates)) throw new Error(`Unsupported WeChat template: ${value}`);
      wechatTemplate = value as keyof typeof styleTemplates;
    } else throw new Error(`Unknown option: ${arg}`);
  }

  if (!input) throw new Error("An input Markdown or text file is required.");
  if (editorialPlans && generationMode !== "reachOptimized") {
    throw new Error("--editorial-plans requires --mode reach-optimized");
  }
  const platforms = platformValue === "all"
    ? [...PLATFORM_IDS]
    : [...new Set(platformValue.split(",").map((item) => {
        const normalized = item.trim().toLowerCase();
        const platform = PLATFORM_ALIASES[normalized];
        if (!platform) throw new Error(`Unsupported platform: ${item}`);
        return platform;
      }))];
  const absoluteInput = path.resolve(input);
  const fallbackName = path.basename(input, path.extname(input)).replace(/[^\p{L}\p{N}._-]+/gu, "-") || "article";
  return {
    input: absoluteInput,
    output: path.resolve(output || `${fallbackName}-self-media`),
    platforms,
    generationMode,
    themeId,
    layoutId,
    ratio,
    blueprint: blueprint ? path.resolve(blueprint) : undefined,
    editorialPlans: editorialPlans ? path.resolve(editorialPlans) : undefined,
    wechatTemplate,
    brand,
  };
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeBlob(filePath: string, blob: Blob) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await blob.arrayBuffer()));
}

async function writeExportedFiles(root: string, files: ExportedFile[]) {
  for (const file of files) await writeBlob(path.join(root, file.path), file.blob);
}

function markdownImageSource(block: UnifiedArticleContent["blocks"][number]) {
  if (block.type !== "image") return undefined;
  const values = [block.markdown, block.source.sourceText, block.text];
  for (const value of values) {
    const match = value.match(/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/u);
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function mimeTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "image/png";
}

async function normalizeImageSource(source: string, inputDirectory: string) {
  if (/^(?:https?:|data:image\/)/iu.test(source)) return source;
  const candidate = source.startsWith("file:") ? fileURLToPath(source) : path.resolve(inputDirectory, decodeURIComponent(source));
  const file = await readFile(candidate);
  return `data:${mimeTypeFor(candidate)};base64,${file.toString("base64")}`;
}

async function resolveImageSources(content: UnifiedArticleContent, inputDirectory: string) {
  const sources: Record<string, string> = {};
  for (const block of content.blocks) {
    const source = markdownImageSource(block);
    if (!source) continue;
    sources[block.id] = await normalizeImageSource(source, inputDirectory);
  }
  return sources;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type CanvasCommand =
  | { operation: "set"; property: string; value: string | number }
  | { operation: "call"; method: string; args: Array<string | number | number[]> };

function recordCanvasCommands(input: CardPageRenderInput, preset: CardPreset, brand: string) {
  const commands: CanvasCommand[] = [];
  const context = {} as CardImageCanvasContext;
  const state: Record<string, string | number> = {};
  const properties = ["fillStyle", "strokeStyle", "font", "textBaseline", "textAlign", "globalAlpha"] as const;
  for (const property of properties) {
    Object.defineProperty(context, property, {
      get: () => state[property],
      set: (value: string | number) => {
        state[property] = value;
        commands.push({ operation: "set", property, value });
      },
    });
  }
  const methods = ["beginPath", "moveTo", "arcTo", "closePath", "fill", "fillRect", "fillText", "arc", "save", "restore", "translate", "rotate", "setLineDash", "strokeRect"] as const;
  for (const method of methods) {
    context[method] = ((...args: Array<string | number | number[]>) => {
      commands.push({ operation: "call", method, args });
    }) as never;
  }
  context.drawImage = (() => undefined) as never;
  context.measureText = ((text: string) => ({ width: text.length * 20 }) as TextMetrics) as never;
  drawCardImagePage(context, input.page, { preset, platform: input.platform, brandLabel: brand });
  return commands;
}

function canvasPageHtml(input: CardPageRenderInput, imageSources: Record<string, string>) {
  const overlays = input.page.nodes.flatMap((node) => {
    if (node.kind !== "image" || !node.image) return [];
    const source = imageSources[node.blockId] ?? imageSources[node.entryId];
    if (!source) return [];
    return [`<img src="${escapeHtml(source)}" alt="${escapeHtml(node.text)}" style="left:${node.image.x}px;top:${node.image.y}px;width:${node.image.width}px;height:${node.image.height}px;opacity:${node.image.opacity ?? 1};transform:rotate(${node.image.rotation ?? 0}deg)">`];
  }).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}html,body{margin:0;width:${input.page.canvas.width}px;height:${input.page.canvas.height}px;overflow:hidden;background:#fff}
    body{position:relative}canvas{display:block;width:${input.page.canvas.width}px;height:${input.page.canvas.height}px}
    img{position:absolute;display:block;object-fit:contain;transform-origin:center center}
  </style></head><body><canvas width="${input.page.canvas.width}" height="${input.page.canvas.height}"></canvas>${overlays}</body></html>`;
}

function createRenderer(browser: Browser, preset: CardPreset, imageSources: Record<string, string>, brand: string) {
  return async (input: CardPageRenderInput) => {
    const page = await browser.newPage({ viewport: { width: input.page.canvas.width, height: input.page.canvas.height }, deviceScaleFactor: 1 });
    try {
      await page.setContent(canvasPageHtml(input, imageSources), { waitUntil: "load" });
      await page.evaluate(() => document.fonts?.ready);
      const commands = recordCanvasCommands(input, preset, brand);
      await page.evaluate((recorded) => {
        const canvas = document.querySelector("canvas");
        const context = canvas?.getContext("2d");
        if (!context) throw new Error("Canvas renderer was not initialized.");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        for (const command of recorded) {
          if (command.operation === "set") {
            (context as unknown as Record<string, string | number>)[command.property] = command.value;
            continue;
          }
          const method = (context as unknown as Record<string, (...args: Array<string | number | number[]>) => void>)[command.method];
          method.call(context, ...command.args);
        }
      }, commands);
      const failedImages = await page.locator("img").evaluateAll((images) => images
        .filter((image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0)
        .map((image) => (image as HTMLImageElement).alt || (image as HTMLImageElement).src.slice(0, 120)));
      if (failedImages.length) throw new Error(`Card image failed to load: ${failedImages.join(", ")}`);
      const png = await page.screenshot({ type: "png" });
      const arrayBuffer = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
      return new Blob([arrayBuffer], { type: "image/png" });
    } finally {
      await page.close();
    }
  };
}

function previewHtml(title: string, imagePaths: string[]) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#ececeb;color:#20201e;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1120px;margin:auto;padding:32px}h1{font-size:24px;margin:0 0 24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}img{display:block;width:100%;height:auto;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.08)}</style></head><body><main><h1>${escapeHtml(title)}</h1><div class="grid">${imagePaths.map((imagePath) => `<img src="${escapeHtml(imagePath)}" alt="${escapeHtml(title)}">`).join("")}</div></main></body></html>`;
}

async function loadBlueprint(filePath: string): Promise<ContentBlueprint> {
  const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  const candidate = value && typeof value === "object" && "blueprint" in value
    ? (value as { blueprint: unknown }).blueprint
    : value;
  return contentBlueprintSchema.parse(candidate);
}

async function loadEditorialPlans(filePath: string, selectedPlatforms?: PlatformId[]): Promise<EditorialPlan[]> {
  const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  let candidates: unknown[];
  if (Array.isArray(value)) candidates = value;
  else if (value && typeof value === "object" && "editorialPlans" in value && Array.isArray((value as { editorialPlans: unknown }).editorialPlans)) {
    candidates = (value as { editorialPlans: unknown[] }).editorialPlans;
  } else if (value && typeof value === "object" && "platformPlans" in value) {
    const platformPlans = (value as { platformPlans: unknown }).platformPlans;
    if (!platformPlans || typeof platformPlans !== "object") throw new Error("Invalid platformPlans in editorial plans file.");
    candidates = Object.values(platformPlans).flatMap((platformPlan) => {
      if (!platformPlan || typeof platformPlan !== "object" || !("editorialPlan" in platformPlan)) return [];
      return [(platformPlan as { editorialPlan: unknown }).editorialPlan];
    });
  } else throw new Error("Editorial plans file must contain editorialPlans or platformPlans.");

  const selected = selectedPlatforms ? new Set<PlatformId>(selectedPlatforms) : undefined;
  const relevantCandidates = selected
    ? candidates.filter((candidate) => candidate && typeof candidate === "object" && "platform" in candidate
      && selected.has((candidate as { platform: PlatformId }).platform))
    : candidates;
  const plans = relevantCandidates.map((candidate) => editorialPlanSchema.parse(candidate));
  const platforms = plans.map((plan) => plan.platform);
  if (new Set(platforms).size !== platforms.length) throw new Error("Editorial plans file contains duplicate platforms.");
  return plans;
}

function metadataFor(plan: ReturnType<typeof analyzeArticleDesign>, platform: PlatformId) {
  const platformPlan = plan.platformPlans[platform];
  return {
    generationMode: plan.generationMode,
    sourceRevision: plan.sourceRevision,
    analysisRevision: plan.analysisRevision,
    themeId: plan.recommendedThemeId,
    layoutId: plan.contentLayoutId,
    template: platformPlan?.visualPresetId ?? plan.recommendedScheme,
    pageTypes: platformPlan?.pages.map((page) => page.kind),
  };
}

function editorialGrounding(plan: DesignPlan, source: UnifiedArticleContent, platform: PlatformId) {
  const editorialPlan = plan.platformPlans[platform]?.editorialPlan;
  if (!editorialPlan) return { status: "missing" };
  const sourceIds = new Set(source.blocks.map((block) => block.id));
  const sourceReferencesValid = editorialPlan.sections.every((section) => section.sourceBlockIds.every((id) => sourceIds.has(id)));
  const text = [
    editorialPlan.title,
    editorialPlan.hook ?? "",
    ...editorialPlan.sections.flatMap((section) => [section.heading ?? "", section.body ?? "", ...(section.bullets ?? [])]),
    editorialPlan.summary ?? "",
  ].join("\n");
  const factCheck = validateGeneratedFacts(text, source);
  return {
    status: sourceReferencesValid && factCheck.ok ? "passed" : "failed",
    sectionCount: editorialPlan.sections.length,
    sourceReferencesValid,
    unsupportedNumbers: factCheck.unsupportedNumbers,
    unsupportedQuantifiers: factCheck.unsupportedQuantifiers,
    unsupportedQuotes: factCheck.unsupportedQuotes,
  };
}

function loadProjectEnvironment() {
  if (process.env.AI_API_KEY && process.env.AI_BASE_URL && process.env.AI_MODEL) return;
  if (typeof process.loadEnvFile !== "function") {
    throw new Error("Reach optimization requires Node.js 20.12 or newer to load the local AI configuration.");
  }
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const fileName of [".env.local", ".env"]) {
    try {
      process.loadEnvFile(path.join(projectRoot, fileName));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function createGeneration(source: UnifiedArticleContent, options: CliOptions) {
  const suppliedBlueprint = options.blueprint ? await loadBlueprint(options.blueprint) : undefined;
  if (options.generationMode === "layoutOnly") {
    const plan = suppliedBlueprint
      ? applySemanticBlueprint(source, suppliedBlueprint, {
          generationMode: options.generationMode,
          recommendedThemeId: options.themeId,
          recommendedLayoutId: options.layoutId,
        })
      : analyzeArticleDesign(source, {
          generationMode: options.generationMode,
          recommendedThemeId: options.themeId,
          recommendedLayoutId: options.layoutId,
        });
    return { plan, contents: new Map<PlatformId, UnifiedArticleContent>(), aiDiagnostics: undefined };
  }

  if (!suppliedBlueprint || !options.editorialPlans) loadProjectEnvironment();
  const blueprint = suppliedBlueprint ?? (await analyzeWithServerAI({
    source,
    sourceVersionId: source.sourceRevision,
    generationMode: "reachOptimized",
  })).blueprint;
  const analyzedPlan = applySemanticBlueprint(source, blueprint, {
    generationMode: "reachOptimized",
    recommendedThemeId: options.themeId,
    recommendedLayoutId: options.layoutId,
  });
  if (options.editorialPlans) {
    const editorialPlans = await loadEditorialPlans(options.editorialPlans, options.platforms);
    const missingPlatforms = options.platforms.filter((platform) => !editorialPlans.some((plan) => plan.platform === platform));
    if (missingPlatforms.length) throw new Error(`Editorial plans file is missing: ${missingPlatforms.join(", ")}`);
    const applied = applyEditorialPlans({
      source,
      analyzedDesignPlan: analyzedPlan,
      editorialPlans,
      platforms: options.platforms,
    });
    const contents = new Map<PlatformId, UnifiedArticleContent>();
    for (const platform of options.platforms) {
      const content = applied.versions[platform]?.content;
      if (!content) throw new Error(`Reviewed editorial plans did not return ${platform} content.`);
      contents.set(platform, content);
    }
    const diagnostics: AIDiagnostics = {
      provider: "deterministic",
      model: "reviewed-editorial-plan",
      sourceVersionId: source.sourceRevision,
      details: ["reviewed_editorial_plans"],
    };
    return { plan: applied.designPlan, contents, aiDiagnostics: diagnostics };
  }
  const provider: AIProvider = {
    model: process.env.AI_MODEL?.trim() || "server-configured",
    generate: (input) => generateWithServerAI(input),
  };
  const generated = await generatePlatformVersions({
    source,
    sourceVersionId: source.sourceRevision,
    generationMode: "reachOptimized",
    platforms: options.platforms,
    analyzedDesignPlan: analyzedPlan,
    provider,
  });
  if (!generated.ok) {
    const diagnostic = [
      generated.error.code,
      generated.error.diagnostics.status ? `HTTP ${generated.error.diagnostics.status}` : undefined,
      generated.error.diagnostics.errorType,
    ].filter(Boolean).join(", ");
    throw new Error(`Reach optimization failed: ${generated.error.message} (${diagnostic})`);
  }
  const contents = new Map<PlatformId, UnifiedArticleContent>();
  for (const platform of options.platforms) {
    const content = generated.versions[platform]?.content;
    if (!content) throw new Error(`Reach optimization did not return ${platform} content.`);
    contents.set(platform, content);
  }
  return { plan: generated.designPlan, contents, aiDiagnostics: generated.diagnostics };
}

function validateReachCardLayout(platform: "xiaohongshu" | "douyinImage", plan: DesignPlan, layout: CardLayoutResult) {
  if (plan.generationMode !== "reachOptimized") return;
  const editorialPlan = plan.platformPlans[platform]?.editorialPlan;
  if (!editorialPlan) throw new Error(`${platform} reach-optimized output has no editorial plan.`);
  const limits = platform === "xiaohongshu"
    ? { sections: [6, 9], pages: [6, 10], maxChars: 330 }
    : { sections: [5, 8], pages: [5, 9], maxChars: 260 };
  if (editorialPlan.sections.length < limits.sections[0] || editorialPlan.sections.length > limits.sections[1]) {
    throw new Error(`${platform} editorial section count ${editorialPlan.sections.length} is outside ${limits.sections[0]}-${limits.sections[1]}.`);
  }
  const invalidHeadings = editorialPlan.sections.filter((section) => {
    const length = Array.from(section.heading?.replace(/\s/gu, "") ?? "").length;
    return length < 4 || length > (platform === "xiaohongshu" ? 12 : 10);
  });
  if (invalidHeadings.length) throw new Error(`${platform} has ${invalidHeadings.length} section heading(s) outside the platform length limit.`);
  if (layout.pages.length < limits.pages[0] || layout.pages.length > limits.pages[1]) {
    throw new Error(`${platform} rendered page count ${layout.pages.length} is outside ${limits.pages[0]}-${limits.pages[1]}.`);
  }
  for (const page of layout.pages) {
    const textLength = page.nodes.reduce((total, node) => total + Array.from(node.text.replace(/\s/gu, "")).length, 0);
    if (textLength > limits.maxChars) throw new Error(`${platform} page ${page.pageNumber} is too dense (${textLength} characters).`);
    if (page.pageKind !== "cover" && !page.nodes.some((node) => node.kind === "heading" || node.kind === "focus")) {
      throw new Error(`${platform} page ${page.pageNumber} has no scan-friendly heading.`);
    }
    if (page.pageKind !== "cover" && !page.nodes.some((node) => node.kind === "body" || node.kind === "focus" || node.kind === "image")) {
      throw new Error(`${platform} page ${page.pageNumber} has no supporting content.`);
    }
  }
}

async function build(options: CliOptions) {
  const raw = await readFile(options.input, "utf8");
  const source = parseSyntaxDocument(raw);
  const { plan, contents, aiDiagnostics } = await createGeneration(source, options);
  const themeId = plan.recommendedThemeId ?? "editorial";
  const layoutId = plan.contentLayoutId ?? "editorial";
  const preset = createCardPreset({ themeId, layoutId });
  const inputDirectory = path.dirname(options.input);
  const createdAt = new Date().toISOString();
  const outputFiles: string[] = [];

  await mkdir(options.output, { recursive: true });
  await rm(path.join(options.output, "manifest.json"), { force: true });
  await writeFile(path.join(options.output, "source.md"), raw, "utf8");
  await writeJson(path.join(options.output, "plan.json"), plan);
  outputFiles.push("source.md", "plan.json");

  let browser: Browser | undefined;
  try {
    if (options.platforms.some((platform) => platform === "xiaohongshu" || platform === "douyinImage")) browser = await chromium.launch({ headless: true });

    for (const platform of options.platforms) {
      const content = contents.get(platform) ?? buildPlatformArticle(source, platform, plan);
      const platformDir = path.join(options.output, platform);
      await rm(platformDir, { recursive: true, force: true });
      await mkdir(platformDir, { recursive: true });
      await writeJson(path.join(platformDir, "content.json"), content);
      outputFiles.push(`${platform}/content.json`);

      if (platform === "wechat") {
        const imageSources = await resolveImageSources(content, inputDirectory);
        const imageNodes = Object.entries(imageSources).map(([blockId, src]) => ({ blockId, src }));
        const template = styleTemplates[options.wechatTemplate ?? (themeId === "storyMagazine" ? "zhenyiStoryMagazine" : themeId === "informationCard" ? "zhenyiChecklist" : "zhenyiKnowledgeMinimal")];
        const wechatContent = createWechatPlatformContent(content, { imageNodes, template });
        const exported = exportWechatHtml({ wechatContent, title: content.title, exportedAt: createdAt });
        await writeFile(path.join(platformDir, "article.html"), exported.html, "utf8");
        await writeFile(path.join(platformDir, "copy.txt"), exported.text, "utf8");
        await writeFile(path.join(platformDir, "preview.html"), `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.title ?? "公众号成稿")}</title><style>body{margin:0;background:#ededed}.page{max-width:720px;margin:32px auto;padding:32px;background:#fff}</style></head><body><main class="page">${exported.html}</main></body></html>`, "utf8");
        outputFiles.push("wechat/article.html", "wechat/copy.txt", "wechat/preview.html");
        continue;
      }

      if (platform === "douyinLongform") {
        const exported = exportDouyinLongformText({ content, exportedAt: createdAt });
        await writeFile(path.join(platformDir, "article.txt"), exported.text, "utf8");
        await writeFile(path.join(platformDir, "tags.txt"), exported.output.tags.map((tag) => `#${tag.replace(/^#/u, "")}`).join(" "), "utf8");
        await writeJson(path.join(platformDir, "manifest.json"), exported.manifest);
        outputFiles.push("douyinLongform/article.txt", "douyinLongform/tags.txt", "douyinLongform/manifest.json");
        continue;
      }

      if (!browser) throw new Error("Browser renderer was not initialized.");
      const imageSources = await resolveImageSources(content, inputDirectory);
      const placeholderImages = Object.fromEntries(Object.keys(imageSources).map((id) => [id, {} as CanvasImageSource]));
      const measurer = createApproximateTextMeasurer();
      const targetPages = platform === "xiaohongshu" ? plan.pagination.xiaohongshuTargetPages : plan.pagination.douyinImageTargetPages;
      const layout = platform === "xiaohongshu"
        ? layoutXiaohongshuPagesToTarget(content, measurer, { aspectRatio: "3:4", sparsePageAlignment: "balanced" }, targetPages)
        : layoutDouyinImagePagesToTarget(content, measurer, { aspectRatio: options.ratio, sparsePageAlignment: "balanced" }, targetPages);
      if (layout.overflow.length) throw new Error(`${platform} layout overflow: ${layout.overflow.length} issue(s)`);
      validateReachCardLayout(platform, plan, layout);
      const renderer = createRenderer(browser, preset, imageSources, options.brand);
      const exported = platform === "xiaohongshu"
        ? await exportXiaohongshuPackage({ content, pages: layout.pages, renderer, images: placeholderImages, preset, exportedAt: createdAt, metadata: metadataFor(plan, platform) })
        : await exportDouyinImagePackage({ content, ratio: options.ratio, pages: layout.pages, renderer, images: placeholderImages, preset, exportedAt: createdAt, metadata: metadataFor(plan, platform) });
      await writeExportedFiles(platformDir, exported.images);
      await writeFile(path.join(platformDir, "copy.txt"), exported.copyText, "utf8");
      await writeFile(path.join(platformDir, "tags.txt"), exported.tagsText, "utf8");
      await writeJson(path.join(platformDir, "manifest.json"), exported.manifest);
      await writeBlob(path.join(platformDir, "package.zip"), exported.zipBlob);
      const relativeImages = exported.images.map((file) => file.path);
      await writeFile(path.join(platformDir, "preview.html"), previewHtml(exported.output.title, relativeImages), "utf8");
      outputFiles.push(...exported.images.map((file) => `${platform}/${file.path}`), `${platform}/copy.txt`, `${platform}/tags.txt`, `${platform}/manifest.json`, `${platform}/package.zip`, `${platform}/preview.html`);
    }
  } finally {
    await browser?.close();
  }

  const manifest = {
    schemaVersion: 1,
    packageType: "selfMediaDraft",
    createdAt,
    sourceRevision: source.sourceRevision,
    analysisRevision: plan.analysisRevision,
    generationMode: plan.generationMode,
    themeId,
    layoutId,
    platforms: options.platforms,
    brand: options.brand,
    ...(aiDiagnostics ? {
      optimization: {
        provider: aiDiagnostics.provider,
        model: aiDiagnostics.model,
        requestId: aiDiagnostics.requestId,
      },
    } : {}),
    outputFiles,
    validation: {
      profile: plan.generationMode === "layoutOnly" ? "sourcePreservingLayout" : "sourceGroundedEditorial",
      sourceWarnings: source.warnings,
      platformIntegrity: Object.fromEntries(options.platforms.map((platform) => [platform, plan.platformPlans[platform]?.integrity ?? null])),
      ...(plan.generationMode === "layoutOnly"
        ? { requiredSourceCoverage: 1 }
        : {
            editorialGrounding: Object.fromEntries(options.platforms.map((platform) => [platform, editorialGrounding(plan, source, platform)])),
            authorReviewRequired: true,
          }),
    },
  };
  await writeJson(path.join(options.output, "manifest.json"), manifest);
  process.stdout.write(`${JSON.stringify({ ok: true, output: options.output, manifest: path.join(options.output, "manifest.json"), files: outputFiles.length + 1 }, null, 2)}\n`);
}

async function main() {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    await stat(options.input);
    await build(options);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main();
