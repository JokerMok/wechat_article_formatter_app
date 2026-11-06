# 风格排版 · 账号中心接入

本仓库支持正式账号中心接入，默认仍运行原工作区。只有设置 `ACCOUNT_MODE=center` 才会启用统一登录并替代本站 AI 口令校验。账号模式缺少配置或权益规则时，受控接口拒绝请求。

## 地址与登记

- 已存在的产品公开入口：<https://wechat-article-formatter.vercel.app/>。此入口仍运行旧版；本轮没有替换部署。
- 隔离验收产品：`http://localhost:3347`；精确回调：`http://localhost:3347/auth/callback/wechat-article-formatter`。
- 正式候选产品标识 `wechat-article-formatter`，Casdoor 应用 `zhenyi-wechat-article-formatter`，组织 `consumers`。正式回调固定为新产品 HTTPS origin 加 `/auth/callback/wechat-article-formatter`。正式账号版须用独立稳定 HTTPS origin，`ACCOUNT_LEGACY_URL` 指向仍运行旧版的原入口。生产 HTTPS 配置会拒绝统一版和旧版使用同一 origin。移动域名无法携带 IndexedDB。
- 正式中心 `https://accounts.shizibandu.icu`、issuer `https://identity.accounts.shizibandu.icu`。2026-11-06 只读核对：公开中心与发行方可访问；生产私密注册表没有当前产品，按产品标识、候选应用、已有域名和排版名称查生产业务产品及 Casdoor 应用均无匹配。Casdoor 未知应用名也会返回发现文档和默认 JWKS，不能以 HTTP 200 判断应用登记。

正式启用前，需要中心运营方在三个层次分别登记：

1. **Casdoor**：登记当前产品独立的消费者应用，JWT-Standard / RS256、授权码＋PKCE S256、精确回调。独立的 client ID 和 secret 只通过服务端秘密配置交付。
2. **业务产品**：登记同一产品、来源、应用、回调，按已批准权益政策设定 `access` 或 `quota`、会员要求、次数和周期。中心当前只承认人工开通或兑换的实际结果。
3. **私密鉴权**：生产 `shared/config/products.json` 登记独立产品服务鉴权，使用独立的服务密钥和对应 Casdoor 应用。业务目录保存不等于鉴权可用。变更由中心运维按生产授权完成；产品部署不修改中心工作树。

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

## 权益与数据边界

- `ACCOUNT_FEATURE_ARTICLE_LAYOUT` 绑定正式功能 ID，动态读取该产品的真实规则：`access` 使用 check；`quota` 使用 check、稳定请求号、预占、确认与恢复。智能结果先持久化再确认；只有已确认的持久结果可交付。相同请求号不重复分析、扣次或交付另一份结果。未确认失败取消预占；已确认但无有效交付时返还；无法核实保留 `pending_recovery`。不存在有效 AI 结果时保留规则排版并按失败恢复。
- 采集、视觉、旧工作区 AI 分析与生成可以绑定对应 `access` 权益，或运营明确设为 `account-only`（仍持续检查活跃身份）。这些端点不接受 `quota` 映射，避免未经扣次就执行。客户端本地排版、主题切换、编辑及导出不能被服务端扣次，也未声明计费。
- 按可信 issuer＋sub 建立一对一中心 UID 映射；未关联旧账号不共享资产、会员、额度。两个旧 IndexedDB 数据库和原 AI 口令工作区没有迁移。新账号稿件、图片、风格和项目在本机按账号分库并以 AES-GCM 加密，索引仍保留不含正文的记录 ID 与时间。解密只在活跃账号的当前浏览器文档中，密钥从认证后端按账号发放，产品密钥和中心令牌不发往浏览器。现有浏览器工作区没有账号归属；不得将正式账号版和旧版部署在同一 origin 后声称旧数据有服务端隔离。正式产品不提供跨设备稿件同步。
- 兑换、安全和权益记录通过产品后端申请中心的 consumer-entry；中心独立校验相同 UID。回到产品时查询中心实际结果。当前退出销毁产品会话；全产品退出须等待中心确认，其他产品在其后续活跃校验时失效。封禁及撤销在敏感请求实时校验。
