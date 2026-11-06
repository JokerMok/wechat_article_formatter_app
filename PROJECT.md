# 自媒体排版工具 · 腾讯云部署

2026-11-06 北京时间，公网已上线。入口为 `https://formatter.shizibandu.icu/`。DNSPod 两台权威服务器均返回 `175.178.236.56`，TTL 600。HTTP 返回 308，HTTPS 返回 200，Let’s Encrypt 证书有效期至 2027-02-04。

| 项目 | 实际部署 |
| --- | --- |
| Git 来源 | `git@github.com:JokerMok/wechat_article_formatter_app.git`，远端默认分支 `main` |
| Git 版本 | `4b28751d9e935e365dab5be72009e2ab785a2198` |
| 发布包 SHA-256 | `07e590eb803fe612b7f4d7b9584aea9d4fe2b3fcb5dfeb78371239a31a9c8856` |
| 服务器 | `ssh tencent-main`，实例 metadata 公网 IP `175.178.236.56` |
| 目录 | `/srv/apps/formatter`，`current` 指向 `releases/4b28751d9e935e365dab5be72009e2ab785a2198` |
| 内部入口 | `127.0.0.1:18877`，systemd `formatter.service` 已启动并设为开机自启 |
| 运行时 | 复用服务器已校验的 Linux Node.js 24.22.0；发布包包含锁定依赖和 Next.js 16.2.4 的独立构建 |
| 公网入口 | `/etc/caddy/sites-enabled/formatter.caddy`，配置源为 `shared/config/site.caddy`，静态根为 `current/web` |
| 私有配置 | `shared/config/runtime.env`，root 0600；配置目录同时保存 service 和维护脚本 |
| 数据 | 稿件和素材由各浏览器使用 IndexedDB；服务器无本版本数据库或上传数据。预留 `shared/data` |
| 备份 | 已有 `server-config-backup.timer` 自动纳入项目根的 `PROJECT.md`、发布指针和 `shared/config`；本版本没有数据库转储 |

该提交提供四平台排版工作区。未提交的风格工作台和统一账号代码未进入发布包。当前版本没有统一账号回调；独立子域名的浏览器存储与旧站分开，可通过项目导出和导入迁移所选稿件。

公网入口提供构建后的首页和哈希静态资源。此版本的框架存在官方安全公告，Next.js 运行端口只供回环访问。两条同源 AI 路径在公网返回明确的 503。正式启用服务端 AI 和统一账号需要新的已提交版本、受控鉴权及对应配置。

首次发布没有上一版。日常更新在 Mac 仓库根目录执行：

```sh
bash deploy/tencent/update.sh
bash deploy/tencent/update.sh <远端提交或标签>
ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh status'
```

脚本从 Git 导出准确提交，使用锁文件构建，校验传输包和文件清单，在保留至少 2 GiB 磁盘空间时写入新发布目录。当前部署方式适用于此版本的静态首页。含动态首页、账号或不同原生依赖的版本需要先调整发布入口和构建包。服务健康检查失败时切回更新前指针。

后续有 `previous` 时，用以下命令切换到上一份通过健康检查的发布。浏览器稿件和共享配置不参与代码回退：

```sh
ssh tencent-main 'sudo /srv/apps/formatter/shared/config/manage.sh rollback'
```

首次发布如需撤下，停止并禁用 `formatter.service`。如果已启用公网站点，只移除本站 Caddy 配置，经现有站点脚本或按服务器维护流程校验并 reload，保留发布包和共享文件。

内部访问：

```sh
ssh -N -L 127.0.0.1:28877:127.0.0.1:18877 tencent-main
```

在 Mac 打开 `http://127.0.0.1:28877/`。DNSPod 当前记录为 `formatter A 175.178.236.56`，默认线路，TTL 600 秒。接入沿用服务器台账记录的主域名腾讯云备案。重新加载本站候选配置时可使用 `bash deploy/tencent/publish-site.sh --icp-verified`，随后从公网复验跳转、证书、主页和同源 API。

本次通过 SSH 隧道验证了真实 Chromium 的 Markdown 输入、公众号生成和 HTML 下载、刷新恢复、同源 AI 状态和私有路径拒绝。回环 Next 首页返回 200，跨站 AI 请求返回 403。公网 Chromium 已验证 Markdown 输入、公众号生成、HTML 导出、刷新恢复和同源请求。公网主页字节与发布包一致。两条 AI 路径返回 503，私有路径返回 404，公网无法连接 18877。发布后磁盘约 2.06 GiB 可用。系统软件包索引重建后需重新核对共享备份的 2 GiB 门槛。
