import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendGuard AI — Real-Time AI Spend Governance Platform",
  description: "See, control, and audit AI cost the same way you manage cloud spend. Real-time budget guardrails and immutable audit logs across OpenAI, Gemini, and Claude.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#FFF9F6] text-[#111111] antialiased selection:bg-[#FF6B35] selection:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
