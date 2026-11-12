# 自媒体排版工具 · 腾讯云部署

2026-11-06 北京时间，公网入口为 `https://formatter.shizibandu.icu/`。DNSPod 两台权威返回 `175.178.236.56`，HTTP 跳转 HTTPS，Let’s Encrypt 证书有效期至 2027-02-04。

| 项目 | 实际部署 |
| --- | --- |
| 正式运行版本 | `d7caaef183dfb7396d70135414d1a48470823fc3` |
| 发布包 SHA-256 | `a610cedf91222883aa0b8d570661497b39b129c85c75327d28bbc87e739c4855` |
| 上一版 | `9265415259d9954eed8befab27c2f41d69e75e4c`，两个差分包均依赖 `974f2b02d123ad1ba3b605828cc859d3097df969` |
| 服务器 | `ssh tencent-main`，`/srv/apps/formatter` |
| 后端 | systemd `formatter.service`，`127.0.0.1:18877`，开机自启 |
| 入口 | Caddy 提供哈希静态资源，风格工作台、受控 API 和账号回调走同源回环反代 |
| 运行时 | Node.js 24.22.0、Next.js 16.4.5、Chromium 153.0.8010.0 |
| 运行包 | 差分运行包使用 `runtime-base.json` 指定的基础版本并校验摘要；Chromium 压缩包在 `runtime/chromium-153.0.0.br`，启动时解包至 `/run/formatter` |
| 私有配置 | `shared/config/runtime.env`，root 0600 |
| 产品账号库 | PostgreSQL `formatter_accounts`，专用角色 `formatter_account`，只经 `127.0.0.1:5342`。复用同一 PostgreSQL 实例，角色无中心两库连接权限 |
| 恢复任务 | `formatter-recovery.timer` 每两分钟核对本产品待恢复任务，调用仅回环可达 |
| 备份 | `server-config-backup.timer` 纳入配置、指针及 `40-formatter-accounts.sh` 一致性备份钩子。接入前快照在 Mac 运维目录 `files/formatter/account-prechange-20261106-172101/` |

公网只提供风格排版，旧 `/multiplatform` 返回 404。正式 Casdoor、业务产品与私密鉴权已登记。实际回调为 `https://formatter.shizibandu.icu/auth/callback/wechat-article-formatter`。浏览器旧稿未删除、迁移或关联。旧版入口仍指向原 Vercel 域名。此前在正式域名创建的匿名草稿留在原浏览器存储中。接入说明见 [账号中心接入](docs/ACCOUNT_CENTER_INTEGRATION.md)。

2026-11-12，生产智能排版启用 `https://api-relay.shizibandu.icu/v1`，模型为 `gpt-6.1-terra`。腾讯云直连健康检查与模型列表返回 200。使用正式版本的排版代码，以合成稿验证了真实模型调用和方案校验，用时约 5.4 秒。生产服务重启后已核对运行配置与公网账号状态接口。仅切换运行配置，继续使用上表所列制品。需要暂停智能排版时，可在私有配置设 `AI_LAYOUT_PROVIDER=off` 后重启服务。历史账号与扣次验收见 [账号中心验收](docs/ACCOUNT_CENTER_ACCEPTANCE.md)。

磁盘可用空间接近共享备份的 2 GiB 门槛。本次回收可重建的固件及软件目录缓存，保留共享备份。早期版本 `4b28751d9e935e365dab5be72009e2ab785a2198` 的完整发布归档在 Mac 的 `~/server-ops/tencent-main/files/formatter/releases/`。保留当前和上一版所需的差分基础包。

从 GitHub 维护分支更新时运行 `bash deploy/tencent/update.sh codex/product-readiness`，也可传入 `local:<提交SHA>`。需要差分构建时先从服务器取基础包，并将其路径和版本分别传入 `FORMATTER_DELTA_BASE`、`FORMATTER_DELTA_BASE_SHA`。基础版本 `974f2b02d123ad1ba3b605828cc859d3097df969` 的包位于 `/srv/apps/formatter/releases/974f2b02d123ad1ba3b605828cc859d3097df969/runtime.tar.gz`。独立构建需要保留当前部署工具和匹配的 Chromium 运行时。

普通回退用 `ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh rollback'`。当前上一版的正式回调在反代后不可用，回退到它前先按 [账号回退步骤](docs/ACCOUNT_CENTER_INTEGRATION.md#正式环境回退) 暂停账号模式。回退保留账号库、加密稿件和旧浏览器数据。
