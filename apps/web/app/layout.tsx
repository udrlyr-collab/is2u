import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PaperSoundProvider } from "../components/paper-sound-provider";
import "./design-tokens.css";
import "./globals.css";

const maruLogo = localFont({ src: "../../../fonts/KMU80TTFHaeongSemiSans.ttf", variable: "--font-maru-logo", display: "swap", preload: true, fallback: ["sans-serif"] });
const maruTitle = localFont({ src: "../../../fonts/KMU80TTFSungkokSemiSerif.ttf", variable: "--font-maru-title", display: "swap", preload: true, fallback: ["serif"] });
const maruBody = localFont({ src: "../../../fonts/KMU80TTFHaeongSans.ttf", variable: "--font-maru-body", display: "swap", preload: true, fallback: ["sans-serif"] });
const maruNote = localFont({ src: "../../../fonts/KMU80TTFSungkokSerif.ttf", variable: "--font-maru-note", display: "swap", preload: true, fallback: ["serif"] });

export const metadata: Metadata = {
  title: { default: "그대로 멈춰라", template: "%s · 그대로 멈춰라" },
  description: "둘만의 평범한 시간을 조용히 보관하는 작은 기억 상자",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "그대로 멈춰라" },
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
  openGraph: { title: "그대로 멈춰라", description: "둘만의 평범한 시간을 조용히 보관하는 작은 기억 상자", type: "website" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#fbf7f1" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className={`${maruLogo.variable} ${maruTitle.variable} ${maruBody.variable} ${maruNote.variable}`}><PaperSoundProvider>{children}</PaperSoundProvider></body></html>;
}
