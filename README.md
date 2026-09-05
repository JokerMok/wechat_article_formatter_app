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
- `服务端 AI`：浏览器先请求本站 `/api/ai/analyze` 理解文章；仅排版在本地完成渲染，传播力优化才请求 `/api/ai/generate` 改写当前平台。上游地址、模型和密钥由服务端环境变量管理。
- `自定义接口`：用于 Ollama、LM Studio 或其他本地 OpenAI-compatible 服务，密钥只保存在当前浏览器会话。

服务端 AI 使用统一的 OpenAI-compatible 配置。复制 `.env.example` 为 `.env.local` 后填写：

```bash
AI_PROVIDER=openai-compatible
AI_API_KEY=你的服务端密钥
AI_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
AI_MODEL=火山方舟接入点ID，例如 ep-xxxxxxxx
AI_CHAT_COMPLETIONS_PATH=/chat/completions
AI_TIMEOUT_MS=90000
AI_MAX_RETRIES=1
AI_REASONING_EFFORT=minimal
AI_ACCESS_CODE=
```

本地运行读取 `.env.local`。部署到 Vercel 时，在项目 `Settings > Environment Variables` 中配置同名变量，并分别勾选 `Preview` 和 `Production`；变量不使用 `NEXT_PUBLIC_` 前缀。当前代码不会自动修改 Vercel 环境变量，也不会自动部署。

服务端路由不是通用代理：请求体不接受上游 URL、Provider、API Key 或 Authorization；服务端只根据部署环境选择固定 Provider，并对输入大小、超时、重试和错误响应做限制。

### 访问认证与部署安全

`AI_ACCESS_CODE` 是本站服务端 AI 的访问口令，不是上游模型的 `AI_API_KEY`。口令须为 16 至 256 位随机字符串，与 API Key 分开设置，不使用 `NEXT_PUBLIC_` 前缀，不写入仓库或部署日志。示例中的空值只适用于本地开发；生产环境必须配置，缺失或长度不合规时，登录及 AI 接口返回 503。

Vercel 的 `Preview` 和 `Production` 环境均须配置 `AI_ACCESS_CODE`。预览部署也使用生产构建，不能省略口令。修改环境变量后须重新部署对应环境。本地开发及测试在未配置口令时允许访问，此模式不得开放到公网；本地配置口令后也需登录。

登录通过后，服务器签发有效期为 24 小时的 HttpOnly、SameSite=Strict cookie，作用路径为 `/api/ai`；生产环境强制设置 Secure，网站须通过 HTTPS 访问。登录口令错误、未登录、会话过期或签名不符时返回 403。更换 `AI_ACCESS_CODE` 会使已有会话失效；会话接口的成功及错误响应均禁止缓存。

限流数据保存在单个服务进程的内存中。登录尝试共享每分钟 12 次额度，模型请求按实例内的客户端标识执行每分钟 12 次限制，实例最多同时持有 2 个请求位；超限返回 429。独立 Node 服务不信任调用者提供的代理 IP 头，模型请求共享同一计数桶。计数表达到容量上限时只清理过期记录，不重置有效记录；没有空位时拒绝新标识。

这些限制只在当前实例内有效，进程重启会清空计数，多个实例也不共享额度。多实例及 Serverless 部署须在受控入口实施限流，或接入共享存储计数；当前内存限流不构成分布式防爆破保护或全站费用上限。

## 本地运行

```bash
npm install
npm run dev
```

## 内容处理链路

1. `SourceDocument` 由 Markdown 语法树生成，保留原文块、标题级别、列表层级、图片、链接和位置。语法解析不判断文章观点。
2. 语义分析输出带来源引用的 `ContentBlueprint`。本地引擎提供基础聚类，AI 负责内容角色与论证关系；内部角色不充当文章标题。相同源文、模式和引擎的分析结果在会话内复用。
3. `PlatformDesignPlan` 负责四平台的内容骨架。仅排版复用原始内容，并校验来源、文字与顺序；传播力优化使用小型 `EditorialPlan`，校验 Schema、来源以及数字和引用后才能生成新稿。
4. 三套独立视觉主题与内容骨架组合。公众号输出微信富文本，抖音长文输出连续阅读 HTML 与文案，两类图文按真实字体度量分页。语义章节确定阅读单元，画布容量决定是否续页。
5. 编辑器工作稿与已生成平台稿分开保存。分析不覆盖右侧成品；生成只影响当前平台；请求期间的人工修改、待生成稿和预览编辑都有保护与恢复路径。
6. 图文预览与 PNG 使用同一 Canvas 渲染入口。图片保持比例，载入失败或文字溢出时阻止导出，不静默省略。ZIP 复用同一批 PNG。

默认仅排版不承诺缩短长文页数。长文必须完整保留时会增加页面；需要压缩为短卡组时，应主动使用传播力优化并复核修改内容。数值和引用校验不等于完整事实核查，AI 优化稿仍须由作者确认。

Playwright 默认使用固定端口 `3003` 自动启动当前应用：

```bash
npx playwright test
```

## 自动化验收范围

- `TEST-025` 使用真实 Playwright 流程覆盖固定 12 篇文章的 48 个平台版本：每篇文章生成微信公众号、小红书图文、抖音图文、抖音长文，分别编辑平台标题、文案或正文，保存后刷新，并验证四端修改能恢复。
- `TEST-025` 同时覆盖四类导出路径：微信公众号 HTML 与富文本复制入口、小红书图文 PNG、抖音图文 PNG、抖音长文文案复制并读取剪贴板内容。
- 截图回归在常规 Playwright 测试中执行 `toHaveScreenshot`，包含桌面端 `desktop-xiaohongshu-3x4-card.png` 和窄屏 `narrow-douyin-9x16-card.png` 基线；测试同时断言没有水平溢出、图文预览保持真实比例且没有页面溢出提示。
- `product-readiness.e2e.ts` 使用真实中文长文及超长、多图片、多级标题、列表引用五类样本完成 20 条四平台流程。逐页保存 PNG，并比较预览与下载文件的解码像素。成品和验收矩阵保存在本地 `artifacts/product-readiness/`，不提交批量生成文件。
- `workspace-preservation.e2e.ts` 验证待生成稿跨项目及备份恢复、输入即保存、生成期间编辑保护。常规 AI E2E 使用真实 Next.js 路由及受控上游。

真实模型验收另行执行，会消耗已配置模型额度，不纳入默认单测：

```bash
RUN_LIVE_AI=1 npx vitest run lib/ai/live-provider.live.test.ts
# 先启动本地服务；若配置了访问口令，通过 AI_ACCEPTANCE_ACCESS_CODE 传入。
node tests/e2e/live-ai-acceptance.mjs
```

后一命令在真实浏览器中完成一次 AI 分析和四次单平台生成，检查源文不变、没有重复分析及浏览器错误。报告仅保存状态、耗时和成品截图，不保存密钥或服务端凭证。
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
