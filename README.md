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

## AI 调用模式

- `本地`：使用确定性生成，不请求外部模型。
- `服务端 AI`：浏览器只请求本站 `/api/ai/generate`，上游地址、模型和密钥由服务端环境变量管理。
- `自定义接口`：用于 Ollama、LM Studio 或其他本地 OpenAI-compatible 服务，密钥只保存在当前浏览器会话。

服务端 AI 使用统一的 OpenAI-compatible 配置。复制 `.env.example` 为 `.env.local` 后填写：

```bash
AI_PROVIDER=openai-compatible
AI_API_KEY=你的服务端密钥
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_MODEL=你的模型接入点或模型名
AI_CHAT_COMPLETIONS_PATH=/chat/completions
AI_TIMEOUT_MS=60000
AI_MAX_RETRIES=1
```

本地运行读取 `.env.local`。部署到 Vercel 时，在项目 `Settings > Environment Variables` 中配置同名变量，并分别勾选 `Preview` 和 `Production`；变量不使用 `NEXT_PUBLIC_` 前缀。当前代码不会自动修改 Vercel 环境变量，也不会自动部署。

服务端路由不是通用代理：请求体不接受上游 URL、Provider、API Key 或 Authorization；服务端只根据部署环境选择固定 Provider，并对输入大小、超时、重试和错误响应做限制。

## 本地运行

```bash
npm install
npm run dev
```

Playwright 默认使用固定端口 `3003` 自动启动当前应用：

```bash
npx playwright test
```

## 自动化验收范围

- `TEST-025` 使用真实 Playwright 流程覆盖固定 12 篇文章的 48 个平台版本：每篇文章生成微信公众号、小红书图文、抖音图文、抖音长文，分别编辑平台标题、文案或正文，保存后刷新，并验证四端修改能恢复。
- `TEST-025` 同时覆盖四类导出路径：微信公众号 HTML 与富文本复制入口、小红书图文 PNG、抖音图文 PNG、抖音长文文案复制并读取剪贴板内容。
- 截图回归在常规 Playwright 测试中执行 `toHaveScreenshot`，包含桌面端 `desktop-xiaohongshu-3x4-card.png` 和窄屏 `narrow-douyin-3x4-card.png` 基线；测试同时断言没有水平溢出、图文预览保持真实比例且没有页面溢出提示。
- 非法图片文件通过选择文件和拖入两条真实上传路径验证，必须出现可见的“图片上传失败”及原因，且非法文件不能进入素材列表。

## 验证命令

```bash
npm test
npm run lint
npm run build
npx tsc --noEmit
npx playwright test --list
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

浏览器自动化会验证富文本复制入口、HTML 清理和图片节点存在，但微信编辑器粘贴效果仍以人工验收为准。正式发布前需人工粘贴到微信编辑器，检查：

- 标题、段落、引用和列表样式没有整体失效。
- 图片节点存在，没有丢图。
- 没有裸露 Markdown、脚本、事件属性或外层应用样式。
- 微信编辑器内二次编辑后，正文结构仍可读。

当浏览器权限或剪贴板能力无法证明微信粘贴效果时，测试会记录 `NEEDS_MANUAL_WECHAT_VERIFICATION`，不把该项伪装成自动通过。
