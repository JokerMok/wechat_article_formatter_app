import type { Metadata } from "next";
import "./globals.css";
import "@/components/studio/studio.css";

export const metadata: Metadata = {
  title: "风格排版 · 公众号文章工作台",
  description: "学习参考风格、编辑公众号文章、制作封面并导出微信图文。",
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
