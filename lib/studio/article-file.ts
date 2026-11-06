import { parseArticle, type ArticleFormat } from "./import";
import { storeDataImage, validateDataImage } from "./storage";
import type { ArticleBlock } from "./types";

export const articleFileTypes = ".docx,.md,.markdown,.html,.htm,.txt";

export async function readArticleFile(file: File, warnings: string[]) {
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (extension === "docx") {
    if (file.size > 25 * 1024 * 1024)
      throw new Error("Word 文件超过 25 MB，请压缩其中的图片后重试。");
    const mammoth = await import("mammoth");
    let html: string;
    try {
      let imageChars = 0;
      const result = await mammoth.convertToHtml(
        { arrayBuffer: await file.arrayBuffer() },
        {
          externalFileAccess: false,
          includeEmbeddedStyleMap: false,
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            ...[1, 2, 3, 4, 5, 6].map(
              (level) =>
                `p[style-name='Heading ${level}'] => h${Math.min(6, level + 1)}:fresh`,
            ),
          ],
          convertImage: mammoth.images.imgElement(async (image) => {
            if (!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType))
              throw new Error(`图片格式不受支持（${image.contentType}）`);
            const base64 = await image.readAsBase64String();
            if (
              base64.length > 14_000_000 ||
              imageChars + base64.length > 32_000_000
            )
              throw new Error("单张或累计图片超过 Word 导入上限");
            imageChars += base64.length;
            return { src: `data:${image.contentType};base64,${base64}` };
          }),
        },
      );
      html = result.value;
      warnings.push(
        ...result.messages.map(({ message }) => `Word 转换：${message}`),
      );
    } catch {
      throw new Error(
        "无法读取 Word 正文。请检查文件是否损坏、加密或需要另存为 .docx。",
      );
    }
    return parseArticle(html, "html", document, warnings);
  }
  if (extension === "doc")
    throw new Error("旧版 .doc 文件请先用 Word 另存为 .docx。");
  const formats: Record<string, ArticleFormat> = {
    md: "markdown",
    markdown: "markdown",
    html: "html",
    htm: "html",
    txt: "text",
  };
  const format = formats[extension ?? ""];
  if (!format)
    throw new Error("请选择 Word（.docx）、Markdown、HTML 或 TXT 文件。");
  if (file.size > 25 * 1024 * 1024)
    throw new Error("文章文件超过 25 MB，请压缩图片或拆分文件。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  let input: string;
  try {
    input = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    try {
      input = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("无法识别文件的文字编码，请另存为 UTF-8 后导入。");
    }
  }
  return parseArticle(input, format, document, warnings);
}

export async function prepareImportedImages(
  blocks: ArticleBlock[],
  warnings: string[],
) {
  let stored = false;
  const prepared: ArticleBlock[] = [];
  for (const block of blocks) {
    if (block.src?.startsWith("data:image/")) {
      try {
        const asset = await storeDataImage(
          block.src,
          block.alt || "导入图片",
          "owned",
        );
        prepared.push({ ...block, src: `asset:${asset.id}` });
        stored = true;
      } catch (error) {
        warnings.push(
          `${block.alt || "嵌入图片"}：${(error as Error).message}`,
        );
      }
    } else if (block.html.includes("<img")) {
      // Images inside lists, linked images and tables stay in their own structure.
      const template = document.createElement("template");
      template.innerHTML = block.html;
      for (const image of template.content.querySelectorAll("img")) {
        const src = image.getAttribute("src") ?? "";
        if (!src.startsWith("data:image/")) continue;
        try {
          await validateDataImage(src);
        } catch (error) {
          warnings.push(
            `${image.alt || "嵌入图片"}：${(error as Error).message}`,
          );
          image.replaceWith(document.createTextNode(image.alt));
        }
      }
      if (
        template.content.textContent?.trim() ||
        template.content.querySelector("img")
      )
        prepared.push({ ...block, html: template.innerHTML });
    } else prepared.push(block);
  }
  return { blocks: prepared, stored };
}
