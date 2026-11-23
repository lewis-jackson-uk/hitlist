import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Owed: who's waiting on you",
  description: "A founder's priority list. Every email you owe a reply, ranked by who is waiting, how long, and whether you are about to see them.",
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
