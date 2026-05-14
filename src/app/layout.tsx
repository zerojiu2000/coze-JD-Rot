import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';

export const metadata: Metadata = {
  title: '求职雷达 · AI求职助手',
  description: '专为转行者设计的AI求职全程陪跑助手，提供JD匹配度评分、简历差距分析、打招呼话术生成、面试题预测等功能。',
  keywords: ['求职雷达', 'AI求职助手', '转行求职', '简历优化', '面试准备'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.COZE_PROJECT_ENV === 'DEV';

  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {isDev && <Inspector />}
        {children}
      </body>
    </html>
  );
}
