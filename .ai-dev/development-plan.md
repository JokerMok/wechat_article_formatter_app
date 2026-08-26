# 自媒体内容排版器开发计划

- 文档状态：待审批
- 实施方式：渐进式重构，不从零重写
- 目标分支：`main`
- 当前基线：14 项测试、ESLint、生产构建全部通过

## 1. 技术方案

### 1.1 核心决策

1. 保留 Next.js、React、TypeScript、现有公众号主题、富文本复制和 Canvas 绘制能力。
2. 新建统一内容结构，源文章只负责事实和结构；平台版本独立保存人工修改。
3. 平台规则、渲染、存储、导出和 UI 分层，页面组件不得直接承担解析和分页逻辑。
4. 先迁移稳定能力，再移除旧单体组件；任何阶段都保留可回滚的主分支基线。
5. AI 通过 OpenAI-compatible 接口生成受限数据，使用 Zod 校验；失败时使用确定性规则降级。
6. 图文继续使用 Canvas 2D，但拆成测量、分页、绘制三个独立模块；所有样式调整触发重新测量和分页。
7. 项目和图片默认本地保存：Zustand 管理会话状态，Dexie 管理 IndexedDB，JSZip 生成导出包。
8. 源文暂不引入完整富文本编辑器，使用 Markdown/普通文本；平台版本使用受控块编辑，降低迁移风险。

### 1.2 目标模块

```text
lib/content/                 统一内容结构、标准化和来源位置
lib/platforms/               公众号、小红书、抖音平台版本生成
lib/renderers/wechat/        公众号内联 HTML
lib/renderers/cards/         图文测量、分页和 Canvas 绘制
lib/ai/                      模型请求、结构校验、差异和降级
lib/assets/                  图片校验、裁剪参数和素材引用
lib/storage/                 项目、素材、迁移和备份
lib/export/                  富文本、HTML、PNG、ZIP 和文本导出
store/                       项目与工作区状态
components/workspace/        统一工作区和平台编辑界面
tests/fixtures/              固定文章、AI 响应和视觉验收数据
tests/e2e/                   完整流程和多视口截图
```

### 1.3 主要数据结构

```ts
type ContentProject = {
  id: string;
  title: string;
  sourceMarkdown: string;
  sourceRevision: number;
  meta: ArticleMeta;
  blocks: ContentBlock[];
  assets: AssetRef[];
  variants: Record<PlatformKey, PlatformVariant | undefined>;
  storageVersion: number;
  createdAt: number;
  updatedAt: number;
};

type PlatformVariant = {
  platform: PlatformKey;
  sourceRevision: number;
  title: string;
  summary?: string;
  caption?: string;
  tags: string[];
  blocks: ContentBlock[];
  pages?: CardPage[];
  locks: VariantLock[];
  history: VariantOperation[];
};
```

## 2. 数据、接口和模块影响

### 数据

- 新增 IndexedDB 数据库，包含 `projects`、`assets`、`settings` 三类记录。
- 所有记录带 `storageVersion`；迁移失败时保留原始记录并阻止覆盖。
- 图片以 Blob 保存，内容块只保存素材 ID，不在项目 JSON 中重复保存 Data URL。
- 项目备份包包含项目 JSON、图片资源和清单文件。

### AI 接口

- 用户填写服务地址、模型和密钥；请求直接从浏览器发送到用户选择的服务。
- 输入包含源文、目标平台和明确的输出要求；输出必须符合 Zod 定义。
- 请求具备超时、取消、最大重试次数和固定错误分类。
- 密钥默认使用内存或 sessionStorage；用户主动选择后才写入本地设置。

### 平台规则

- `PlatformProfile` 集中保存支持比例、默认尺寸、样式范围和输出能力。
- 当前默认画布：小红书 `1080×1440`；抖音 `1080×1440`、`1080×1920`。
- 平台规则带版本号，规则变化时不要求改动工作区组件。

## 3. 执行批次

```text
Wave 1
└─ T001 统一内容结构与依赖基线

Wave 2
├─ T002 本地项目与素材存储
├─ T003 公众号平台与渲染迁移
├─ T004 图文测量、分页和绘制引擎
├─ T005 小红书与抖音平台版本
└─ T006 AI 生成、校验和降级

Wave 3
├─ T007 分平台导出与项目包
└─ T008 统一工作区与平台编辑

Wave 4
└─ T009 集成、视觉回归和旧入口清理
```

## 4. 任务清单

| 任务 | 内容 | 需求 | 依赖 | 执行者 | 风险 |
|---|---|---|---|---|---|
| T001 | 统一内容结构、标准化和依赖 | REQ-002、REQ-014 | 无 | cloud | high |
| T002 | 本地项目、图片处理、迁移和状态 | REQ-001、REQ-009、REQ-010 | T001 | cloud | medium |
| T003 | 公众号平台版本与内联 HTML | REQ-005 | T001 | cloud | medium |
| T004 | 图文测量、重排、分页和绘制 | REQ-008 | T001 | cloud | high |
| T005 | 小红书、抖音图文和长文规则 | REQ-003、REQ-006、REQ-007 | T001 | cloud / Spark | high |
| T006 | AI 请求、结构校验、差异和降级 | REQ-004、REQ-013、REQ-014 | T001 | cloud | high |
| T007 | 富文本、HTML、PNG、ZIP 和备份导出 | REQ-011、REQ-013 | T002、T003、T004、T005 | cloud / Spark | medium |
| T008 | 统一工作区、编辑、预览和素材操作 | REQ-001、REQ-003、REQ-005 至 REQ-012 | T002、T003、T004、T005、T006 | cloud / Spark | high |
| T009 | 完整流程、截图基线、回归和旧入口清理 | REQ-001 至 REQ-014 | T007、T008 | cloud | high |

独立任务包见 `.ai-dev/tasks/T001.md` 至 `.ai-dev/tasks/T009.md`，机器调度信息见同名 JSON。

## 5. 开发约束

- 每个任务使用独立分支和独立 worktree，不在当前目录直接实现。
- 实现前先建立失败测试或可复现的契约/截图夹具，再写最小实现。
- 每个任务只允许修改任务包列出的路径；超出范围必须停止并回到规划。
- GPT-5.3-Codex-Spark 仅执行 T005、T007、T008 的实现部分；T001、T002、T003、T004、T006、T009 和全部独立审查使用完整 Codex。
- Spark 执行者必须显式运行任务包中的测试、类型检查和 Lint；不能因为响应速度快而省略验证。
- 每个实现任务完成后由不同的云端 Codex 审查，不允许实现者自审放行。
- 任务上下文包在审批后、委派前按 8000 token 预算生成；执行者不得自行读取全仓库。
- 任何 P0、P1、P2 审查问题均阻止进入下一批次。

## 6. 迁移方案

1. T001 至 T006 新增独立模块，不切换现有入口。
2. T007 完成新导出能力后，旧复制和 Canvas 导出仍保留作为对照。
3. T008 将 `app/page.tsx` 切换到新工作区，但暂不删除旧单体文件。
4. T009 运行完整回归、固定文章集和微信粘贴复核后，删除旧单体入口。
5. IndexedDB 使用新数据库名和版本号，不直接改写无法识别的旧数据。

## 7. 回滚方式

- 任务级失败：丢弃该任务 worktree，不合并协调分支。
- 批次失败：协调分支回到上一批已验收提交，保留失败日志和差异。
- UI 切换失败：恢复 `app/page.tsx` 对旧组件的引用，新模块保留但不启用。
- 数据迁移失败：停止写入新格式，导出原始记录，不删除旧 IndexedDB 数据。
- AI 服务异常：关闭 AI 入口，继续使用基础平台版本生成。
- 最终集成失败：不合并 `main`、不推送、不部署。

## 8. 全局验证命令

```bash
npm test
npm run lint
npm run build
npx playwright test
```

最终验收还必须执行：

- 12 篇固定文章生成四个平台版本。
- `3:4`、`9:16` 桌面和窄屏截图对比。
- 公众号富文本和图片粘贴到微信编辑器人工复核。
- 项目刷新恢复、完整项目包导入导出和 AI 失败降级。

## 9. 明确排除项

- 平台自动登录、草稿同步、自动发布和定时发布。
- 用户系统、云端数据库、多人协作和跨设备同步。
- P1 品牌模板、版本历史和封面辅助。
- P2 本地发布助手。
- 未经许可证核验直接复制外部项目代码。

## 10. 风险与停止条件

- 图文重排无法建立可测量的溢出判定时，T004 停止，不用截图主观放行。
- AI 无法稳定返回固定结构时，保留确定性生成，AI 功能不得进入默认流程。
- 微信编辑器粘贴出现丢图或样式失效时，公众号复制不得标记完成。
- 规划文件、任务路径或需求发生变化时，现有审批失效，回到第一阶段重新审批。
