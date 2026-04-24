import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "微信公众号文章自动排版器",
  description: "支持多模板切换、Markdown 导入、HTML 导出、图片占位识别，以及更强的文章结构分析。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
