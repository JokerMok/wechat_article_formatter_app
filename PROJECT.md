# 自媒体排版工具 · 腾讯云部署

2026-11-06 北京时间，公网入口为 `https://formatter.shizibandu.icu/`。DNSPod 两台权威返回 `175.178.236.56`，HTTP 跳转 HTTPS，Let’s Encrypt 证书有效期至 2027-02-04。

| 项目 | 实际部署 |
| --- | --- |
| 正式运行版本 | `9265415259d9954eed8befab27c2f41d69e75e4c` |
| 发布包 SHA-256 | `847b43031c94c2e560f26228ed43cbec1f4e62e7d5a603d67bf4f3545572f232` |
| 上一版 | `974f2b02d123ad1ba3b605828cc859d3097df969`，同时是当前差分运行包的基础版本 |
| 服务器 | `ssh tencent-main`，`/srv/apps/formatter` |
| 后端 | systemd `formatter.service`，`127.0.0.1:18877`，开机自启 |
| 入口 | Caddy 提供哈希静态资源，风格工作台、受控 API 和账号回调走同源回环反代 |
| 运行时 | Node.js 24.22.0、Next.js 16.4.5、Chromium 153.0.8010.0 |
| 运行包 | 差分运行包以 `previous/runtime.tar.gz` 为基础并校验摘要；Chromium 压缩包保存在 `runtime/chromium-153.0.0.br`，启动时解包至 `/run/formatter` |
| 私有配置 | `shared/config/runtime.env`，root 0600 |
| 备份 | `server-config-backup.timer` 自动纳入维护记录、配置和发布指针，前版配置见 `shared/backups/before-974f2b02d123ad1ba3b605828cc859d3097df969` |

公网只提供风格排版，旧 `/multiplatform` 返回 404。浏览器稿件未执行删除或迁移。生产账号中心还没有本产品登记，环境未启用账号模式。站点显示真实的账号开通状态，后续回调固定为 `https://formatter.shizibandu.icu/auth/callback/wechat-article-formatter`。正式开通需要共享账号中心变更授权和独立产品数据库。

原模型密钥在 Mac 实测可成功返回补全。腾讯云直接访问同一个 Vercel 中转超时，线上环境未放入模型密钥，智能排版使用规则。服务端访问口令与模型密钥分开，网页采集仍可通过访问口令使用。公网浏览器已验证旧入口下线、账号与模型提示、整篇粘贴；生产构建和 HTTPS 通过。

磁盘可用空间只略高于共享备份的 2 GiB 门槛。已将最早的 `4b28751d9e935e365dab5be72009e2ab785a2198` 完整发布归档到 Mac 的 `~/server-ops/tencent-main/files/formatter/releases/`，归档与逐文件清单均通过校验。保留服务器上的上一版完整运行包，当前差分依赖它。

从 GitHub 维护分支更新时运行 `bash deploy/tencent/update.sh codex/product-readiness`。也可指定本地发布提交 `bash deploy/tencent/update.sh local:<提交SHA>`。独立构建需要保留当前部署工具和匹配的 Chromium 运行时。

回退时执行 `ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh rollback'`。回退仅切换应用。前版 Caddy 和启动脚本保存在本次项目备份目录。代码切换不处理浏览器数据。
