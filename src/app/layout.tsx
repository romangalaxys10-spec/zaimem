import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZaiMem — Session Memory & Context Enhancer for every MCP agent",
  description:
    "Auto-issued private token, MCP endpoint and magic prompt that give every MCP-capable agent (chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae, Antigravity, zcode, Koda, Pi, Grok…) persistent vector memory, context enhancement, a token saver and smart-skill orchestration.",
  keywords: ["ZaiMem", "MCP", "chat.z.ai", "vector memory", "context enhancer", "token saver", "smart skill"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "ZaiMem — Session Memory & Context Enhancer",
    description: "Persistent vector memory + context enhancer MCP for every MCP agent — chat.z.ai, Claude Code, Cursor, Cline, Windsurf, Trae and more",
    siteName: "ZaiMem",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
