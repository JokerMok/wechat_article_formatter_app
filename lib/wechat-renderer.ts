import type { ArticleBlock, InlineStyle, StyleTemplate } from "./article-types";

function escapeHtml(str: string) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toStyle(style: InlineStyle) {
  return Object.entries(style)
    .map(([key, value]) => `${key}: ${value}`)
    .join("; ");
}

function formatInline(text: string) {
  let out = escapeHtml(text.trim());
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 800;">$1</strong>');
  out = out.replace(/__(.*?)__/g, '<strong style="font-weight: 800;">$1</strong>');
  out = out.replace(/`([^`]+)`/g, '<span style="font-family: Menlo, Monaco, Consolas, monospace; background-color: #f3f4f6; padding: 1px 4px;">$1</span>');
  out = out.replace(/"([^"]{2,})"/g, '"<strong style="font-weight: 800;">$1</strong>"');
  return out;
}

function paragraph(style: InlineStyle, content: string) {
  return `<p style="${toStyle(style)}">${content}</p>`;
}

function span(style: InlineStyle, content = "") {
  return `<span style="${toStyle(style)}">${content}</span>`;
}

function renderTitle(block: ArticleBlock, template: StyleTemplate) {
  const visual = template.visual;
  const title = paragraph(template.blocks.title, formatInline("text" in block ? block.text : ""));

  if (visual.theme === "modern") {
    return `<section style="margin: 0 0 30px; text-align: center;">${span({ display: "inline-block", width: "42px", height: "4px", "background-color": visual.accent, "border-radius": "999px", margin: "0 0 12px" })}${title}${span({ display: "inline-block", width: "78px", height: "2px", "background-color": visual.border, "border-radius": "999px", margin: "6px 0 0" })}</section>`;
  }

  if (visual.theme === "grace") {
    return `<section style="margin: 0 0 34px; text-align: center;">${span({ display: "inline-block", width: "52px", height: "1px", "background-color": visual.border, margin: "0 0 12px" })}${title}${span({ display: "inline-block", width: "88px", height: "3px", "background-color": visual.primary, "border-radius": "999px", margin: "10px 0 0" })}</section>`;
  }

  if (visual.theme === "simple") {
    return `<section style="margin: 0 0 32px; text-align: left;">${span({ display: "block", width: "34px", height: "4px", "background-color": visual.primary, "border-radius": "8px 24px 8px 24px", margin: "0 0 12px 8px" })}${title}</section>`;
  }

  return `<section style="margin: 0 0 32px; text-align: center;">${span({ display: "inline-block", width: "28px", height: "2px", "background-color": visual.primary, "vertical-align": "middle", margin: "0 10px 0 0" })}${span({ display: "inline-block", width: "8px", height: "8px", "background-color": visual.primary, "border-radius": "50%", "vertical-align": "middle" })}${title}${span({ display: "inline-block", width: "96px", height: "2px", "background-color": visual.primary, margin: "8px auto 0" })}</section>`;
}

function renderSection(block: ArticleBlock, template: StyleTemplate) {
  const visual = template.visual;
  const text = formatInline("text" in block ? block.text : "");

  if (visual.theme === "modern") {
    return `<section style="margin: 36px 0 20px;">${paragraph(template.blocks.section, text)}${span({ display: "block", width: "100%", height: "1px", "background-color": visual.border, margin: "8px 0 0" })}</section>`;
  }

  if (visual.theme === "simple") {
    return `<section style="margin: 44px 0 24px; text-align: center;">${span({ display: "inline-block", padding: "0 10px", color: visual.primary, "font-size": "13px", "font-weight": 700, "letter-spacing": "0.08em" }, "SECTION")}${paragraph(template.blocks.section, text)}</section>`;
  }

  if (visual.theme === "grace") {
    return `<section style="margin: 48px 0 26px; text-align: center;">${paragraph(template.blocks.section, text)}${span({ display: "inline-block", width: "68px", height: "2px", "background-color": visual.border, margin: "10px 0 0" })}</section>`;
  }

  return `<section style="margin: 48px 0 26px; text-align: center;">${span({ display: "inline-block", width: "16px", height: "16px", "border-radius": "50%", "background-color": visual.softBg, border: `1px solid ${visual.primary}`, "vertical-align": "middle", margin: "0 8px 0 0" })}${paragraph(template.blocks.section, text)}</section>`;
}

function renderBlock(block: ArticleBlock, template: StyleTemplate) {
  const styles = template.blocks;
  const visual = template.visual;

  switch (block.type) {
    case "title":
      return renderTitle(block, template);
    case "lead":
      return `<section style="${toStyle(styles.lead)}">${span({ color: visual.primary, "font-weight": 800 }, "导语")}${span({ color: visual.border, margin: "0 8px" }, "/")}${formatInline(block.text)}</section>`;
    case "section":
      return renderSection(block, template);
    case "subsection":
      return paragraph(styles.subsection, formatInline(block.text));
    case "paragraph":
      return paragraph(styles.paragraph, formatInline(block.text));
    case "quote":
      return `<section style="${toStyle(styles.quote)}">${span({ color: visual.primary, "font-size": "22px", "font-weight": 800, "line-height": "1", margin: "0 8px 0 0" }, visual.quoteSymbol)}${formatInline(block.text)}</section>`;
    case "golden":
      return `<section style="${toStyle(styles.golden)}">${formatInline(block.text)}</section>`;
    case "summary":
      return `<section style="${toStyle(styles.summary)}">${formatInline(block.text)}</section>`;
    case "cta":
      return `<section style="${toStyle(styles.cta)}">${span({ display: "block", "font-size": "13px", "font-weight": 700, opacity: 0.82, margin: "0 0 6px" }, visual.ctaPrefix)}${formatInline(block.text)}</section>`;
    case "image":
      return `<section style="${toStyle(styles.image)}">${span({ display: "inline-block", padding: "2px 10px", border: `1px solid ${visual.border}`, color: visual.primary, "font-size": "13px", "font-weight": 700, "border-radius": "999px", margin: "0 0 8px" }, "图片占位")}<br />${formatInline(block.text)}</section>`;
    case "list":
      return `<section style="${toStyle(styles.list)}">${block.items
        .map((item) => {
          const matched = item.match(/^([^：:]{2,20})[:：](.+)$/);
          if (matched) {
            return paragraph(
              { margin: "0 0 12px", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight },
              `<span style="${toStyle(template.marker.listBullet)}">${formatInline(matched[1])}：</span>${formatInline(matched[2])}`
            );
          }
          return paragraph(
            { margin: "0 0 12px", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight },
            `<span style="${toStyle(template.marker.listBullet)}">${visual.listSymbol}</span> ${formatInline(item)}`
          );
        })
        .join("")}</section>`;
    case "card":
      return `<section style="${toStyle(styles.card)}">${
        block.title
          ? paragraph({ margin: "0 0 10px", "font-weight": 800, color: visual.primary, "font-size": `${template.body.fontSize}px`, "line-height": "1.8" }, `${span({ display: "inline-block", width: "6px", height: "6px", "background-color": visual.primary, "border-radius": "50%", margin: "0 8px 2px 0" })}${formatInline(block.title)}`)
          : ""
      }${paragraph({ margin: "0", "font-size": `${template.body.fontSize}px`, "line-height": template.body.lineHeight }, formatInline(block.body))}</section>`;
    default:
      return "";
  }
}

export function renderWechatHtml(blocks: ArticleBlock[], template: StyleTemplate) {
  return `<section style="${toStyle({ ...template.container, "font-family": template.fontFamily })}">\n${blocks.map((block) => renderBlock(block, template)).join("\n\n")}\n</section>`;
}
