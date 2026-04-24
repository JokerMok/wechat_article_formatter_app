# 微信公众号文章自动排版器

支持多模板切换、Markdown 导入、HTML 导出、图片占位识别，以及更强的文章结构分析。

## 功能特性

- **多模板切换**：科技感、商业感、情绪风、极简专栏
- **Markdown 导入**：支持 .md/.markdown/.txt 文件
- **HTML 导出**：一键下载或复制 HTML
- **图片占位识别**：自动识别"配图：""图片：""此处插入："
- **结构分析**：自动识别导语、总结、金句、卡片、CTA、列表
- **实时预览**：输入即可查看效果

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- shadcn/ui

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 项目结构

```
wechat_article_formatter_app/
├── app/              # Next.js App Router
├── components/       # UI 组件
├── lib/              # 工具函数
├── wechat_article_formatter_app.tsx  # 主应用组件
└── ...
```
