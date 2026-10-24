import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import type { ReactNode } from "react";
import { getSiteUrl } from "@/config/seo";
import { SITE } from "@/config/site";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-geist",
  display: "swap",
  // Symbols the font lacks (→ ✓ ✦ ★) must fall back to the system font, as in the original design,
  // not to next/font's metric-matched Arial fallback.
  adjustFontFallback: false,
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
  display: "swap",
  adjustFontFallback: false,
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
  adjustFontFallback: false,
});

const DEFAULT_TITLE = `${SITE.name} — ${SITE.tagline}`;

/**
 * Site-wide defaults. Pages add their canonical URL and, where it differs, their
 * own title and description; private pages (sign-in, dashboard) opt out of
 * indexing themselves. The Open Graph image comes from `opengraph-image.tsx`.
 */
export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: DEFAULT_TITLE, template: `%s — ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
  },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    locale: "en_US",
    title: DEFAULT_TITLE,
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SITE.description,
  },
  icons: {
    icon: [
      { url: "/assets/logo/tentact-block-mark.svg", type: "image/svg+xml" },
      { url: "/assets/logo/tentact-block-32.png", type: "image/png", sizes: "32x32" },
    ],
    apple: "/assets/logo/tentact-block-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f1efea",
};

/**
 * Hides animated elements until the page scripts are ready to play their
 * entrance, so nothing flashes in its final state first. The 3 s fallback
 * guarantees content is shown even if scripts fail to run.
 */
const PRE_ANIMATION_SCRIPT =
  "document.documentElement.classList.add('pre');setTimeout(function(){document.documentElement.classList.remove('pre')},3000)";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const fontVariables = `${geist.variable} ${geistMono.variable} ${instrumentSerif.variable}`;

  return (
    <html lang="en" className={fontVariables} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_ANIMATION_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
