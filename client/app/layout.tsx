import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpendGuard AI · by Dattreo — Real-Time AI FinOps & Governance Gateway",
  description: "Enterprise AI FinOps platform by Dattreo. Sub-5ms atomic budget reservations, multi-provider routing (OpenAI, Claude, Gemini), statistical anomaly detection, and immutable audit ledgers.",
  keywords: ["AI FinOps", "LLM Cost Management", "SpendGuard", "Dattreo", "OpenAI Proxy", "AI Budget Enforcement", "Token Cost Tracking"],
  authors: [{ name: "Dattreo", url: "https://www.dattreo.com" }],
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,500;0,8..60,600;0,8..60,700;1,8..60,400&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[#FBFBFA] text-[#18191B] antialiased selection:bg-[#FF6B35] selection:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
