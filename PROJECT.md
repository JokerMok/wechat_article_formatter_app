# 自媒体排版工具 · 腾讯云部署

2026-11-06 北京时间，公网入口为 `https://formatter.shizibandu.icu/`。DNSPod 两台权威返回 `175.178.236.56`，HTTP 跳转 HTTPS，Let’s Encrypt 证书有效期至 2027-02-04。

| 项目 | 实际部署 |
| --- | --- |
| 本机源码快照 | `44ccda31b70ee4af0c7d8eb4a329b7a015ce57d3`，父提交为本机 `335bcb18c11a12255dc30aba3289219187bfaf99` |
| 正式运行版本 | `974f2b02d123ad1ba3b605828cc859d3097df969`，本地发布分支 `codex/formatter-tencent-20261106-134204`，GitHub 维护分支 `codex/product-readiness` |
| 发布包 SHA-256 | `741815173080959008f69c5aca80fd8e8c081033db6573a6b96b8401771ff471` |
| 上一版 | `4b28751d9e935e365dab5be72009e2ab785a2198`，仍保留在 `previous` |
| 服务器 | `ssh tencent-main`，`/srv/apps/formatter` |
| 后端 | systemd `formatter.service`，`127.0.0.1:18877`，开机自启 |
| 入口 | Caddy 提供哈希静态资源，两个工作台和六条受控接口走同源回环反代 |
| 运行时 | Node.js 24.22.0、Next.js 16.4.5、Chromium 153.0.8010.0 |
| 运行包 | 压缩应用包及 `runtime/chromium-153.0.0.br` 持久保存，启动时解包至 `/run/formatter` |
| 私有配置 | `shared/config/runtime.env`，root 0600 |
| 备份 | `server-config-backup.timer` 自动纳入维护记录、配置和发布指针，前版配置见 `shared/backups/before-974f2b02d123ad1ba3b605828cc859d3097df969` |

新版首页为风格排版，原四平台入口为 `/multiplatform`。原稿、素材、风格保存在对应浏览器 IndexedDB，服务端本次没有业务数据库迁移。正式账号入口需独立登记与配置。腾讯云到现有模型中转的连接超时或重置，当前运行配置关闭模型语义分析，网页采集和规则排版可用。需要使用受控网页采集时，从服务器私有环境文件取得本产品访问口令。

公网 Chromium 验证了整篇粘贴、即时套版、确认保存、刷新恢复、HTML 下载、原四平台入口与同源请求。HTTPS 后端实测了口令会话、合成 HTML 采集和一篇公开公众号文章采集。35 项定向测试、Next.js 生产构建和文件校验通过。公网账号接口返回 404。部署后磁盘可用约 2.01 GiB，需继续关注共享备份要求的 2 GiB 空闲门槛。

从 GitHub 维护分支更新时运行 `bash deploy/tencent/update.sh codex/product-readiness`。也可指定本地发布提交 `bash deploy/tencent/update.sh local:<提交SHA>`。独立构建需要保留当前部署工具和匹配的 Chromium 运行时。

回退时执行 `ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh rollback'`。Caddy 根据发布目录中的标记自动切回旧版静态入口。新版激活前已用该规则验证旧版页面；已保留 Caddy 和 systemd 的前版配置。代码切换不处理浏览器数据。
