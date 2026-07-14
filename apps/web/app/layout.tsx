import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { PaperSoundProvider } from "../components/paper-sound-provider";
import "./design-tokens.css";
import "./globals.css";

const maruLogo = localFont({ src: "../../../fonts/MaruBuri-Bold.ttf", variable: "--font-maru-logo", weight: "700", display: "swap", preload: true, fallback: ["serif"] });
const maruTitle = localFont({ src: "../../../fonts/MaruBuri-SemiBold.ttf", variable: "--font-maru-title", weight: "600", display: "swap", preload: true, fallback: ["serif"] });
const maruBody = localFont({ src: "../../../fonts/MaruBuri-Regular.ttf", variable: "--font-maru-body", weight: "400", display: "swap", preload: true, fallback: ["serif"] });
const maruNote = localFont({
  src: [
    { path: "../../../fonts/MaruBuri-ExtraLight.ttf", weight: "200", style: "normal" },
    { path: "../../../fonts/MaruBuri-Light.ttf", weight: "300", style: "normal" },
  ],
  variable: "--font-maru-note",
  display: "swap",
  preload: true,
  fallback: ["serif"],
});

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
