# 风格排版 · 账号中心接入

本仓库支持正式账号中心接入，默认仍运行原工作区。只有设置 `ACCOUNT_MODE=center` 才会启用统一登录并替代本站 AI 口令校验。账号模式缺少配置或权益规则时，受控接口拒绝请求。

## 地址与登记

- 正式产品为 <https://formatter.shizibandu.icu/>，精确回调为 <https://formatter.shizibandu.icu/auth/callback/wechat-article-formatter>。
- <https://wechat-article-formatter.vercel.app/> 继续提供原域名的旧版工作区。此前在正式产品域名创建的匿名草稿留在其原浏览器存储中，统一账号不会自动读取或迁移这些草稿。
- 隔离验收产品：`http://localhost:3347`；精确回调：`http://localhost:3347/auth/callback/wechat-article-formatter`。
- 正式中心为 `https://accounts.shizibandu.icu`，issuer 为 `https://identity.accounts.shizibandu.icu`。产品标识为 `wechat-article-formatter`，Casdoor 应用为 `zhenyi-wechat-article-formatter`，组织为 `consumers`。2026-11-06 已核对以下三项独立登记。

1. **Casdoor** 独立消费者应用使用 JWT-Standard、RS256、授权码、PKCE S256 及精确回调。
2. **业务目录** 已启用产品及 `article-layout`、`style-vision`。AI 智能排版按次计量，默认免费额度为零。参考图视觉分析单独要求有效产品会员。已有基础网页采集只要求活跃登录。会员和额度通过中心人工开通或兑换，支付未启用。
3. **私密鉴权** 使用生产中心 `shared/config/products.json` 中的独立登记和对应凭据。产品独立密钥通过真实接口和跨产品拒绝探测验证。共享中心发布版本未更改。

## 产品部署与回退

使用 Node.js 22+ 与本产品专用 PostgreSQL。Vercel 必须连接可从运行环境访问的持久数据库；不能使用实例临时文件或账号中心数据库。把 [.env.example](../.env.example) 的账户配置注入目标部署环境，任何凭据均不得使用 `NEXT_PUBLIC_`。数据库连接可用供应商提供的连接池地址并启用 TLS；最小运行账号只需访问 `formatter_accounts` schema，迁移可以使用独立 DDL 账号。

先在产品 DB 有权限的维护环境备份已有 `formatter_accounts` schema（首次部署尚不存在则备份项目数据库现有 schema）。例如将 PostgreSQL 连接和密码分别放在私密的 `pg_service.conf` / `.pgpass`，以 `pg_dump --dbname=service=formatter --schema=formatter_accounts --format=custom --file=formatter-accounts-before.dump` 备份。确认指向产品库，再执行：

```sh
npm ci
node --env-file-if-exists=.env.local scripts/migrate-accounts.mjs
npm run build
npm run start
```

本轮两份 SQL 只新增产品私有 schema、账号映射、登录尝试、会话、排版任务及账号工作区密钥。迁移可重跑。产品部署切换时保留数据库，不回滚表、不删除用户或任务。回退时先停止新任务，继续保留该版本的恢复处理直到没有未决账目，再回退产品部署。浏览器原库继续留在原 origin；新账号数据也不删除。备份的 schema 与加密稿件密钥必须一起保留；仅在隔离目标验证恢复后，才执行获授权的恢复。

用受信任调度器每 2–5 分钟向本产品 `GET /api/internal/account-recovery` 发送 `Authorization: Bearer <CRON_SECRET>`。独立密钥至少 32 字符，通过调度器的秘密注入；不要放查询参数。部署计划须支持所需调度频率。先验证此入口与恢复接口能调用，再开放扣次功能。调度只读取本产品已持久化的任务，不能新开预占或授予权益。

腾讯云使用 [无密钥环境模板](../deploy/tencent/runtime.env.example)、`formatter-recovery.timer` 和 [一致性备份钩子](../deploy/tencent/backup-formatter-accounts.sh)。调度以回环 POST 调用，公网入口返回 404。生产产品库 `formatter_accounts` 使用专用角色 `formatter_account`，仅复用现有 PostgreSQL 进程。已核对该角色无权连接中心的 `casdoor` 或 `entitlements` 库。配置、回退和备份位置见 [PROJECT.md](../PROJECT.md)。

### 正式环境回退

1. 先将 `AI_LAYOUT_PROVIDER` 设为 `off`，暂停实际模型交付。保持账号模式和恢复定时器运行，核对产品库 `formatter_accounts.jobs` 中的非终态任务。等待预占、已确认交付或待返还全部核实。必要时用产品私有的恢复调度器继续恢复。
2. 回退到正式回调修复之前的 `9265415` 时，先在产品私有配置将 `ACCOUNT_MODE` 设为 `off`，再执行发布脚本的 `rollback`。只有账号模式被暂停且未决账目已清理时才停恢复定时器。重启后分别检查首页和账号状态。重新启用时先部署支持反代回调的版本，再启用账号模式及定时器。
3. 保留产品数据库、账号映射、工作区密钥和中心审计。应用回退无需撤销中心登记。如确需停用登记，由共享中心运维只停用该产品并保留账目。恢复数据库前先在隔离库验证快照可用，勿用接入前的中心快照覆盖正式运行库。

## 权益与数据边界

- `ACCOUNT_FEATURE_ARTICLE_LAYOUT` 绑定正式功能 ID，动态读取该产品的真实规则：`access` 使用 check；`quota` 使用 check、稳定请求号、预占、确认与恢复。智能结果先持久化再确认；只有已确认的持久结果可交付。相同请求号不重复分析、扣次或交付另一份结果。未确认失败取消预占；已确认但无有效交付时返还；无法核实保留 `pending_recovery`。不存在有效 AI 结果时保留规则排版并按失败恢复。
- 采集、视觉、旧工作区 AI 分析与生成可以绑定对应 `access` 权益，或运营明确设为 `account-only`（仍持续检查活跃身份）。这些端点不接受 `quota` 映射，避免未经扣次就执行。客户端本地排版、主题切换、编辑及导出不能被服务端扣次，也未声明计费。
- 按可信 issuer＋sub 建立一对一中心 UID 映射；未关联旧账号不共享资产、会员、额度。两个旧 IndexedDB 数据库和原 AI 口令工作区没有迁移。新账号稿件、图片、风格和项目在本机按账号分库并以 AES-GCM 加密，索引仍保留不含正文的记录 ID 与时间。解密只在活跃账号的当前浏览器文档中，密钥从认证后端按账号发放，产品密钥和中心令牌不发往浏览器。现有浏览器工作区没有账号归属；不得将正式账号版和旧版部署在同一 origin 后声称旧数据有服务端隔离。正式产品不提供跨设备稿件同步。
- 兑换、安全和权益记录通过产品后端申请中心的 consumer-entry；中心独立校验相同 UID。回到产品时查询中心实际结果。当前退出销毁产品会话；全产品退出须等待中心确认，其他产品在其后续活跃校验时失效。封禁及撤销在敏感请求实时校验。
