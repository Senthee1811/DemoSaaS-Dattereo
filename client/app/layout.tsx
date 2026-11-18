import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (no runtime request to Google, no layout shift).
// Exposed as CSS variables consumed by the --font-* tokens in globals.css.
const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-source-serif",
});
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-jetbrains-mono" });

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
    <html
      lang="en"
      className={`scroll-smooth ${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable}`}
    >
      <body className="bg-[#FBFBFA] text-[#18191B] antialiased selection:bg-[#FF6B35] selection:text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
