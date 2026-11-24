import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HitList: who you need to hit up next",
  description: "A founder's priority list. Every email you owe a reply, ranked by who is waiting, how long, and whether you are about to see them.",
  applicationName: "HitList",
  // Home screen app on iPhone: full screen, with its own name under the icon
  appleWebApp: { capable: true, title: "HitList", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#eef1f4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,300..800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
