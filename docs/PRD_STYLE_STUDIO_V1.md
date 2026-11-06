# AI 文章风格复刻与可视化排版平台｜PRD V1.0

> 日期：2026-11-05  
> 状态：需求基线（尚未实现）；功能对标基于公开项目 README/厂商帮助文档，项目能力与许可证仍须在代码集成时复核。

## 1. 一句话定位

让创作者把喜欢的公众号文章、网页和封面转换成自己的可复用视觉风格：**采集参考 → AI 分析 → 风格入库 → 套用原创文章 → 所见即所得编辑 → 微信兼容导出/草稿**。

不是通用 AI 写作器，也不是纯粹的几十套预置模板。最重要的用户价值是：**我看见了喜欢的成品，可以用自己的内容快速得到同一种设计语言的成品。**

## 2. 产品目标及范围

- 用户：个人公众号运营、自媒体创作者、企业内容运营；后续开放团队协作/品牌库。
- 平台：先把微信公众号做透；后续扩展小红书图文、网页长文、知乎等。扩展不是把公众号 HTML 原样粘贴到各平台，而是共享风格语义、分平台渲染。
- 内容原则：默认严格保留用户自己的文字事实、标题和图片，不擅自改写；仅允许调整结构、视觉样式、排版节奏；AI 建议与改写须显式授权。
- 参考原则：提取视觉规则，不默认复用其他作者的文章正文、版权图片、Logo、插画、商标、封面成品。
- 完成标准：用户无需写 Markdown、HTML 或提示词，完成从参考到可发布稿件的闭环。

## 3. 需求清单与逐项最佳对标

优先级：P0=第一版必须；P1=第二阶段；P2=扩展。对标表示**已核实有相邻能力、值得借鉴**，不代表该项目已完成我们整项需求。

| ID | 优先级 | 用户需求 / 产品功能 | 首选对标（具体能力） | 我们要实现的差异 / 验收要点 |
|---|---|---|---|---|
| R01 | P0 | 粘贴公众号及普通网页链接，提取参考文章 | [wechat-layout](https://github.com/Greatbeing/wechat-layout)：URL 风格提取；[Mozilla Readability](https://github.com/mozilla/readability)：正文抽取；[Playwright](https://github.com/microsoft/playwright)：浏览器渲染 | 抓到正文 DOM、标题层级、图片和计算样式；失败给出原因与截图/粘贴回退，绝不虚报完成 |
| R02 | P0 | 支持粘贴 HTML/富文本、普通文字、Markdown 作为参考或目标内容 | [135 编辑器](https://www.135editor.com/beautify_editor.html)：多格式导入；[doocs/md](https://github.com/doocs/md)：Markdown/文件输入 | 清楚区分“参考风格”和“我的文章”两个入口；保留目标内容数据 |
| R03 | P0 | 截图/长图作为参考，学习无法抓取链接的风格 | [Everything Mimic Skill](https://github.com/glanderness/everything-mimic-skill)：PDF/截图风格抽象；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：参考组件截图定制整套主题 | 视觉模型识别颜色、结构、排版；对截图不可判断的属性标记“估计”，允许人工调整 |
| R04 | P0 | 识别文字、标题、引言、列表、卡片、图片、分隔、重点等结构及布局规则 | [Everything Mimic Skill](https://github.com/glanderness/everything-mimic-skill)：风格档案和图文节奏；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：语义组件 | 输出结构化 `style-profile`，而不是一次性 HTML 截图；区分全局主题/组件样式/版式规则 |
| R05 | P0 | 颜色、字号、行距、间距、段落、边框、图注、图片样式精细提取 | [WeWrite](https://github.com/imraywang/wewrite)：主题学习与主题库；[壹伴](https://yiban.io/help)：采集局部样式 | 优先使用真实 DOM computed styles；缺失时由视觉模型推断；用户可编辑参数 |
| R06 | P0 | 一键提取整篇文章的视觉语言并保存成可复用风格 | [WeWrite](https://github.com/imraywang/wewrite)：`learn-theme <url>`；[wechat-layout](https://github.com/Greatbeing/wechat-layout)：保存提取的风格 | 风格卡片含预览缩略图、名称、来源、标签、版本、适用平台、提取可信度 |
| R07 | P0 | 将自己的文章一键套用参考风格 | [Everything Mimic Skill](https://github.com/glanderness/everything-mimic-skill)：先结构化再迁移；[WeWrite](https://github.com/imraywang/wewrite)：主题应用/渲染 | 语义块匹配，不能强制补写原文不存在的内容；不得改动用户事实和段落顺序（未经授权） |
| R08 | P0 | 在同一篇文章上同时预览多套风格，点击直接切换 | [WeWrite](https://github.com/imraywang/wewrite)：`gallery` 多主题浏览器预览；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：整篇换主题 | 风格卡片/并排对比；切换仅重新渲染，不重复调用 LLM；保持文章内容及图片 |
| R09 | P0 | 真正所见即所得的富文本编辑器和手机阅读预览 | [Tiptap](https://github.com/ueberdosis/tiptap)：可扩展富文本引擎；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：本地可编辑工作台与手机预览 | 点击正文直接改字、图片、标题层级；右侧调样式，立即生效；不是只显示静态图片 |
| R10 | P0 | 全局样式修改与局部组件覆写 | [135 编辑器](https://www.135editor.com/)：字体/间距/样式精细化；[壹伴](https://yiban.io/help)：局部样式采集和收藏 | 全文换主题不清空用户局部修改；可单独重置局部修改或全部重置 |
| R11 | P0 | 粘贴自己的文章、Markdown 导入、自动识别层级（Word 后续） | [doocs/md](https://github.com/doocs/md)：导入和稿件管理；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：语义规划 | 支持纯文本和 Markdown；Word 可作为 P1 增补；解析错误可以一键手动改块类型 |
| R12 | P0 | 从参考封面提取色彩、构图、字体气质并保存封面风格 | [WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：统一正文/封面美术方向；[GudongCover](https://github.com/maoruibin/GudongCover)：封面生成器 | 参考封面为单独输入；封面风格与正文风格可拆开保存/组合，避免复制他人版权元素 |
| R13 | P0 | 用文章标题/关键词一键生成可编辑封面候选 | [GudongCover](https://github.com/maoruibin/GudongCover)：主题到封面；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：生成候选并人工选用 | 至少三张候选；大字尽量由确定性排版层叠加，不完全依赖生图模型；支持字体/字号/位置/裁切调整 |
| R14 | P0 | 微信公众号兼容导出，一键复制图文 | [WeWrite](https://github.com/imraywang/wewrite)：微信兼容性检查和 CSS 内联；[doocs/md](https://github.com/doocs/md)：微信图文渲染 | 导出仅正文、CSS 内联、安全过滤；图片保留，复制后不丢图文；真实公众号草稿中复核 |
| R15 | P0 | 草稿自动保存、编辑历史、风格版本 | [doocs/md](https://github.com/doocs/md)：本地草稿自动保存；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：最近任务/主题导出 | 刷新不丢内容；文章稿与风格资产独立存储；可回退最近版本 |
| R16 | P0 | 失败回退、来源授权、安全处理 | [Readability](https://github.com/mozilla/readability) + [DOMPurify](https://github.com/cure53/DOMPurify) | URL 抓取失败支持截图或手动粘贴；过滤不可信 HTML，禁止脚本执行/SSRF/凭证泄露；记录原素材来源及使用权状态 |
| R17 | P1 | 连接公众号账号并推送到草稿箱 | [WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：公众号草稿交付；[WeWrite](https://github.com/imraywang/wewrite)：推送流程 | 仅在账号有接口权限时提供；同步后要再取回核对；不默认自动群发 |
| R18 | P1 | 浏览器插件：在参考文章页面一键“采集风格” | [壹伴助手](https://yiban.io/help)：网页圈选样式；[135 浏览器插件](https://www.135editor.com/books/chapter/1/772)：采集文章/样式代码等 | 从页面直接发到个人风格库，减少复制 URL 步骤；首版可用粘贴 URL 代替 |
| R19 | P1 | 模板库管理：收藏、分类、搜索、排序、共享、导入导出 | [WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：自定义 `.vdtheme` 分享；[WeWrite](https://github.com/imraywang/wewrite)：个人主题库 | P0 有个人库基础管理；P1 增强标签、检索、批量、分享权限 |
| R20 | P1 | 适用多平台导出和一稿多版 | [WeWrite](https://github.com/imraywang/wewrite)：平台内容改写能力；[GudongCover](https://github.com/maoruibin/GudongCover)：公众号/小红书封面 | 共用内容结构和视觉 token；不同平台独立 renderer，不复用微信 HTML 当成小红书产物 |
| R21 | P1 | AI 给出 3 个推荐风格并解释理由，但由用户最终选择 | [WeWrite](https://github.com/imraywang/wewrite)：主题画廊；[WeChat Visual Director](https://github.com/zhouke0929/wechat-visual-director)：样本册 | 推荐排序只是便利功能，不阻止手动选风格；不给 AI 主导最终审美决策 |
| R22 | P2 | 品牌模板、团队协作、权限、商业化订阅、共享模板市场 | [135 企业会员](https://www.135editor.com/)：多账号运营和模板服务（商业功能对标） | 另立项目阶段，不要拖慢初版闭环 |

## 4. 用户全流程

### A. 学习参考文章，保存风格

1. 首页点击「学习新风格」。
2. 粘贴公众号/网页 URL，或上传截图、长图、PDF；选择「文章排版」「封面」「两者」。
3. 系统获取文章正文 DOM、计算样式、完整截图及元信息；无权限或抓取失败直接说明并显示替代输入。
4. AI 与规则引擎共同输出风格：全局视觉 token、标题/正文/引用/图片等组件规则、图文节奏和原创化替换建议。
5. 展示「原参考截图 / 结构化复刻示例」对照；标记可复刻、估计、平台不支持的设计。
6. 用户直接修改颜色/字号/间距/边框/图片规则，保存「我的风格」，附来源、缩略图、版本与授权标签。

### B. 套用自己的文章、比较和编辑

1. 点击「新建排版」→ 粘贴稿件/导入已有文章。
2. 解析文章为段落、标题、列表、引用、图片等语义块；优先保留原文及图片顺序。
3. 选「刚学习的风格」「我的收藏」「内置风格」，可多选作比较。
4. 同一篇文章以并排卡片预览多个主题；切换主题不重新调模型、不更改文字。
5. 进入编辑画布（中部）；右侧可调全局/当前块样式，顶部切换桌面/手机；一键撤销/重做。
6. 自动保存文章、所用风格版本、局部覆写参数；可另存为新风格。

### C. 参考封面 → 套用自有标题

1. 上传参考封面图片，或从可取得的原文章封面选择参考。
2. 分析图像的配色、构图、字区、字体气质、材质，不直接盗用版权主体和Logo。
3. 输入本文标题/副标题、选择适用平台和尺寸，选择「沿用正文主题」或独立封面风格。
4. 输出三张候选，支持本地可编辑的文本叠加层、文字安全区、裁剪、字号、颜色和位置调整。
5. 用户选择并保存封面；风格单独入库供下次复用。

### D. 导出和公众号交付

1. 点击「导出」选择公众号。
2. 运行平台兼容检查（内联 CSS、图片/外链/复杂布局处理、无效节点、XSS 清理）。
3. 展示手机模拟预览和风险提示；支持复制富文本 HTML/下载交付包。
4. （P1）若账号具备相应 API 权限，推送至公众号草稿箱。
5. 用户在公众号后台保存并真实预览，确认无丢图和样式错乱，再自行正式发布。

### E. 复用与迭代

1. 下次新建文章直接在「我的风格」里选模板，无需重新抓取和分析。
2. 修改后的模板可「仅应用于本篇」或「保存为新版本」。
3. 记录每个风格的最近使用时间、版本及来源；P1 再引入分享/团队品牌库。

## 5. 主要页面与信息架构

- 首页：两个主入口「学习风格」「排版我的文章」；最近稿件、最近使用风格。
- 风格学习页：左侧参考来源；中间原图和复刻示例对比；右侧风格参数和提取状态；底部「保存风格」。
- 我的风格库：卡片缩略图、适用范围、来源、标签、收藏、预览、应用、编辑、版本管理。
- 排版工作台：左栏文章结构与风格卡，中间 WYSIWYG 画布，右栏样式参数；顶部手机/桌面/比较/导出。
- 封面工作台：参考封面、文章标题和平台尺寸、候选图，支持标题字层编辑。
- 导出面板：微信兼容提醒、预览/复制/下载，P1 有草稿箱同步。

## 6. 技术架构（建议，非指定唯一实现）

- **参考采集**：Playwright 浏览器页面渲染、DOM 与 computed styles 提取、完整截图；Mozilla Readability 辅助正文识别；截图/PDF 回退；合法性校验与文件沙箱。
- **AI 理解**：视觉模型分析截图的布局/节奏/艺术方向；规则提取优先使用 DOM/CSS 实值；机器结果带来源可信度。
- **内部数据协议**：`ArticleDocument`（结构化内容块）、`StyleProfile`（design tokens + 组件规范 + 布局约束）、`CoverStyle`（构图+色彩+字层）、`RenderResult`（平台产物）。
- **所见即所得**：Tiptap 开源编辑核心 + 自研主题应用面板；用固定 Schema + Token 映射渲染。切换主题不调用 LLM。
- **平台渲染器**：单独 `wechatRenderer` 负责微信支持的标签与内联样式，并提供复制富文本；后续加 `xiaohongshuRenderer` 等。
- **图片/封面**：图像模型生成原创背景、封面文字独立排版叠加；支持人工上传替代模型。
- **持久化**：文章/版本/风格/素材独立存储，记录参考 URL 与版权归属声明；一旦做 SaaS，多用户隔离和额度管理。
- **安全**：DOMPurify 等 HTML 清理；浏览器抓取端隔离内网和 metadata 地址、防 SSRF；图片来源控制；密钥服务端加密存储、不进入日志和页面；外部抓取内容绝不作为系统指令。

### StyleProfile 最小字段

```json
{
  "id": "style_001",
  "name": "暖色杂志",
  "source": {"type": "wechat_url", "url": "...", "capturedAt": "..."},
  "tokens": {"colors": {}, "typography": {}, "spacing": {}, "radius": {}, "borders": {}},
  "components": {"h1": {}, "h2": {}, "paragraph": {}, "quote": {}, "list": {}, "image": {}, "caption": {}, "divider": {}, "callout": {}},
  "layoutRules": {"articleWidth": null, "sectionRhythm": [], "imagePolicy": {}},
  "platformOverrides": {"wechat": {}},
  "assetsPolicy": {"reuseThirdPartyAssets": false},
  "confidence": {"mode": "dom+vision", "uncertainKeys": []},
  "version": 1
}
```

## 7. MVP（P0）交付切片与依赖

1. **切片 1：真实文章可复制**：输入文章→结构化→选 3 套内置主题→手机预览→微信兼容复制；建立编辑器与 renderer 基础。
2. **切片 2：参考风格可学习**：URL/截图→设计 token 与组件提取→对照预览→保存风格→套用自有文章；完成核心差异化。
3. **切片 3：封面成品可复用**：参考封面→原创同风格候选→可编辑标题→导出；不影响正文排版闭环。
4. **切片 4：可靠性与上线**：真实微信后台粘贴/保存/手机端验证、素材断链回退、自动保存、基本安全、许可梳理。

P1 才做浏览器插件、微信 API 草稿、团队共享、多平台引擎、风格 AI 推荐。若研发能力有限，不要同时建设完整自媒体运营后台和内容选题/写作流水线。

## 8. 验收标准

- 正文：导入与套版前后文本、数字、专有名词、段落顺序默认一致（保留用户授权修改例外）；文章编辑操作可撤销、重做。
- 视觉：至少 3 篇不同结构的真实参考文章（含一个只有截图）成功保存可复用风格；主色、标题、正文、引用、图片和留白规则可识别和手调；展示原参考与复刻对照，不能用“全凭 AI 感觉”替代。
- 复用：一份 StyleProfile 至少成功套用到 3 篇不同正文，不需要重新做风格分析；主题切换时不丢内容、图片和局部覆写。
- 所见即所得：编辑文字、块样式与图片后，画布即时更新；保存后刷新状态一致；手机预览清晰。
- 封面：参考风格提取→至少 3 张原创候选→文字层可编辑→导出所选封面；不直接复制第三方封面原图。
- 微信：输出内联 CSS；实际微信公众号编辑器粘贴、保存草稿、手机预览；至少对 3 篇用例记录截图差异并修复重要错版。**不能承诺全部样式 100% 像素一致。**
- 异常：不可访问 URL、动态图丢失、不合法 HTML、图片过大、断网、未配置 AI 等情况有明确错误说明和退路；没有凭空成功。

以上为目标验收口径，并非已经测试通过的指标。

## 9. 商业化和法律约束

- 风格本身可以借鉴通用设计原则，但不能假设第三方文章内容、图片、插画、Logo、商标、特殊字体素材可直接复用或可商用。
- 对每个参考保留来源链接、采集时间和素材版权/授权状态。发布前需用户确认权利与内容。
- 技术选型优先独立开发/可商用的许可：Everything Mimic Skill（MIT）、WeWrite（MIT）、wechat-layout（MIT）、WeChat Visual Director（Apache-2.0）、Tiptap 编辑核心（MIT）、GudongCover（MIT）。商业集成前仍需检查各依赖、图片、字体、图标及通知文件。
- **特别注意**：[mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter) 仓库标注 AGPL-3.0，但其 README 额外写明“未经书面授权禁止商业用途”。两种表述存在许可解释风险。仅用于功能和交互对标，不直接复制代码，除非取得明确许可/法律确认。
- 运营成本重点是**参考分析与封面生图**，而不是每次切换主题；尽量缓存风格档案，频繁交互采用确定性本地渲染。
- 市场空白、付费意愿、复刻相似度均为待验证假设，不能作为既定产品事实。

## 10. 对标来源清单

1. WeWrite — https://github.com/imraywang/wewrite （URL 学习主题、主题画廊、微信兼容与发布）
2. Everything Mimic Skill — https://github.com/glanderness/everything-mimic-skill （风格抽象、图文节奏、StyleProfile）
3. WeChat Visual Director — https://github.com/zhouke0929/wechat-visual-director （可编辑工作台、参考图主题创作、手机预览、封面）
4. wechat-layout — https://github.com/Greatbeing/wechat-layout （URL 风格提取 + Markdown 转微信 HTML）
5. doocs/md — https://github.com/doocs/md （成熟微信 Markdown 编辑器、主题和草稿）
6. Tiptap — https://github.com/ueberdosis/tiptap （富文本编辑核心）
7. Mozilla Readability — https://github.com/mozilla/readability （正文提取）
8. Playwright — https://github.com/microsoft/playwright （浏览器渲染、截图、DOM 获取）
9. DOMPurify — https://github.com/cure53/DOMPurify （不可信 HTML 消毒）
10. GudongCover — https://github.com/maoruibin/GudongCover （封面生成）
11. 壹伴官方帮助 — https://yiban.io/help （采集样式与收藏）
12. 135 编辑器 — https://www.135editor.com/ （编辑器、素材、导入导出）
13. TypeZen / wechat-formatter — https://github.com/mspringjade/wechat-formatter （多主题、实时手机预览，注意商业许可争议）

## 11. 产品决策

本项目建议作为**可独立商品化的文章风格复刻引擎及可视化 SaaS**构建，提供 API/模块供既有自媒体工作台调用，而不是从一开始依赖 Codex 执行每次编辑。在研发顺序上，优先打通「参考风格→我的正文→所见即所得→微信实测」，再加封面、插件和多平台。
