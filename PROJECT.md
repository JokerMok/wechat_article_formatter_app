# 自媒体排版工具 · 腾讯云部署

2026-11-06 北京时间，公网入口为 `https://formatter.shizibandu.icu/`。DNSPod 两台权威返回 `175.178.236.56`，HTTP 跳转 HTTPS，Let’s Encrypt 证书有效期至 2027-02-04。

| 项目 | 实际部署 |
| --- | --- |
| 正式运行版本 | `563fa59f9e128bc3b8e9efbab5573dd2ac00bfdd` |
| 发布包 SHA-256 | `3f340fd629aa7d0c2fd43634d233081d8eae602f1ce13f6ecd1d9b843b560785` |
| 上一版 | `3922fe039bded3e5943c72cdb932fda511edc362`，差分基础仍为 `974f2b02d123ad1ba3b605828cc859d3097df969` |
| 服务器 | `ssh tencent-main`，`/srv/apps/formatter` |
| 后端 | systemd `formatter.service`，`127.0.0.1:18877`，开机自启 |
| 入口 | Caddy 提供哈希静态资源，风格工作台、受控 API 和账号回调走同源回环反代 |
| 运行时 | Node.js 24.22.0、Next.js 16.4.5、Chromium 153.0.8010.0 |
| 运行包 | 差分运行包使用 `runtime-base.json` 指定的基础版本并校验摘要；Chromium 压缩包在 `runtime/chromium-153.0.0.br`，启动时解包至 `/run/formatter` |
| 私有配置 | `shared/config/runtime.env`，root 0600 |
| 产品账号库 | PostgreSQL `formatter_accounts`，专用角色 `formatter_account`，只经 `127.0.0.1:5342`。复用同一 PostgreSQL 实例，角色无中心两库连接权限 |
| 恢复任务 | `formatter-recovery.timer` 每两分钟核对本产品待恢复任务，调用仅回环可达 |
| 备份 | `server-config-backup.timer` 纳入配置、指针及 `40-formatter-accounts.sh` 一致性备份钩子。接入前快照在 Mac 运维目录 `files/formatter/account-prechange-20261106-172101/` |

公网只提供风格排版，旧 `/multiplatform` 返回 404。登录页提供账号密码登录、注册和找回密码入口。正式 Casdoor、业务产品与私密鉴权已登记。实际回调为 `https://formatter.shizibandu.icu/auth/callback/wechat-article-formatter`。此前的匿名草稿留在创建稿件的浏览器中。接入说明见 [账号中心接入](docs/ACCOUNT_CENTER_INTEGRATION.md)。

2026-11-12，生产智能排版启用 `https://api-relay.shizibandu.icu/v1`，模型为 `gpt-6.1-terra`。腾讯云直连健康检查与模型列表返回 200。合成稿调用真实模型并通过方案校验，用时约 5.4 秒。需要暂停智能排版时，可在私有配置设 `AI_LAYOUT_PROVIDER=off` 后重启服务。历史账号与扣次验收见 [账号中心验收](docs/ACCOUNT_CENTER_ACCEPTANCE.md)。

同日上线新版工作台及两步 AI 封面。公网 Chromium 验证了桌面和手机登录页、错误密码提示、PKCE 注册跳转、找回密码跳转与新版背景资源。两条封面接口均对匿名请求返回 401。登录后的完整封面生成、保存、刷新和 PNG 导出已在本地候选版本通过真实模型网关验证。

磁盘可用空间接近共享备份的 2 GiB 门槛。本次回收可重建的固件及软件目录缓存，保留共享备份。早期版本 `4b28751d9e935e365dab5be72009e2ab785a2198` 的完整发布归档在 Mac 的 `~/server-ops/tencent-main/files/formatter/releases/`。保留当前和上一版所需的差分基础包。

从 GitHub 维护分支更新时运行 `bash deploy/tencent/update.sh codex/product-readiness`，也可传入 `local:<提交SHA>`。需要差分构建时先从服务器取基础包，并将其路径和版本分别传入 `FORMATTER_DELTA_BASE`、`FORMATTER_DELTA_BASE_SHA`。基础版本 `974f2b02d123ad1ba3b605828cc859d3097df969` 的包位于 `/srv/apps/formatter/releases/974f2b02d123ad1ba3b605828cc859d3097df969/runtime.tar.gz`。独立构建需要保留当前部署工具和匹配的 Chromium 运行时。

普通回退用 `ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh rollback'`。当前上一版 `d7caaef` 支持正式回调。若继续回退至 `9265415`，先按 [账号回退步骤](docs/ACCOUNT_CENTER_INTEGRATION.md#正式环境回退) 暂停账号模式。此次 Caddy 的上一份配置在 `/srv/ops/rollback/caddy/formatter.Y4y0YZqE`。

## 2026-11-19 单点登录与平台所有者

按用户明确授权，仅修复账号接续与权限识别。正式运行625635b，中心75a02fb；新增003授权事务字段和固定 `/api/account/sso` 转发，保留issuer、回调、client ID和所有私密配置。由个人中心“打开产品”可直接进入Admin工作台，不再重复输入密码；产品菜单显示永久会员和无限次数。直接打开站点时可选择“平台管理员登录”。
类型、改动范围ESLint、3项专项测试和正式构建通过；正式真实凭据→官方授权码→产品PKCE回调→独立Cookie与权益查询通过，回调重放拒绝。浏览器从个人中心跳转、Admin工作台和权益菜单均实际通过。原3个身份／工作区摘要一致，仅新增超管独立映射，不自动关联其他消费者旧稿。
产品停写备份 `/srv/backups/formatter/accounts-before-sso-625635b.dump` 及校验保留，previous为bc78039，003兼容旧代码。没有执行真实AI任务或作品编辑。

同日合并产品登录入口。正式运行 `3922fe0`，账号中心 `10afc7c`。直接进入风格排版时，`admin` 与普通账号共用账号密码表单。Safari 实测“个人中心 → 打开产品”直接进入 Admin 工作台，退出产品后也能在同一登录表单重登。两条路径均显示永久会员和不限次数。两项目类型检查、相关测试和正式构建通过。回退版本 `625635b`，应用与数据结构兼容。

## 2026-11-19 公众号图文复制修复

正式运行 `563fa59`。原备用复制目标位于模态弹窗外，导致内容无法选中，命令却返回成功，实测剪贴板保留旧值。现在在弹窗内同步写入 HTML 和纯文本，并检查复制事件已填入数据，导出窗口内直接反馈结果。Chromium 的真实剪贴板读写、富文本粘贴及失败状态通过，WebKit 26.5 实际粘贴保留正文、可解码 PNG、链接与内联样式。定向检查和生产构建通过，线上前端文件逐字节匹配发布包。公众号后台保存草稿尚未实测。浏览器证据在 `artifacts/style-studio/clipboard-fix/`，上一版 `3922fe0` 可回退。
