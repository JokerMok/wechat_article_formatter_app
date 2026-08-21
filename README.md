# 自媒体内容排版器

本项目是本地优先的自媒体内容排版工作区。正式入口是 `app/page.tsx`，页面加载 `components/workspace/unified-workspace.tsx`。仓库根目录的 `wechat_article_formatter_app.tsx` 仅保留为旧引用兼容导出，不再是正式入口。

## 功能

- 一篇源文生成四个平台版本：微信公众号、小红书图文、抖音图文、抖音长文。
- 四个平台版本独立保存。修改某个平台标题、正文、标签、分页或比例，不反向污染源文和其他平台。
- 微信公众号支持可编辑预览、富文本复制和 HTML 导出。
- 小红书图文使用 `1080x1440` 的 3:4 页面。
- 抖音图文支持 `1080x1440` 和 `1080x1920` 切换。
- 图文页支持字号、行距、段距、边距调整，以及拆页、合页、排序、锁定、撤销和重做。
- 图片保存在当前浏览器本地 IndexedDB。项目备份 JSON 会记录图片元数据，但不会把原始图片文件打包进 JSON。

## 本地运行

```bash
npm install
npm run dev
```

Playwright 默认使用固定端口 `3003` 自动启动当前应用：

```bash
npx playwright test
```

## 验证命令

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit
git diff --check
npx playwright test
```

如本机没有安装 Playwright 浏览器，先执行：

```bash
npx playwright install
```

## 固定文章集

验收文章位于 `tests/fixtures/content/articles.ts`，共 12 篇，覆盖：

- 普通文本
- Markdown 标题和段落
- 长文
- 列表
- 引用
- 图片占位
- 异常 Markdown
- 独立 `>`
- 残留 `font-weight` 样式
- 超长单段
- 极端英文长度
- 空文章

## 微信粘贴人工验收

浏览器自动化只能验证富文本复制调用、HTML 清理和图片节点存在。正式发布前仍需人工粘贴到微信编辑器，检查：

- 标题、段落、引用和列表样式没有整体失效。
- 图片节点存在，没有丢图。
- 没有裸露 Markdown、脚本、事件属性或外层应用样式。
- 微信编辑器内二次编辑后，正文结构仍可读。

当浏览器权限或剪贴板能力无法证明微信粘贴效果时，测试会记录 `NEEDS_MANUAL_WECHAT_VERIFICATION`，不把该项伪装成自动通过。
