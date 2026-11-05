import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NordParcel",
  description: "Shipping help, quotes and booking.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Courier+Prime:ital,wght@0,400;0,700;1,400&family=EB+Garamond:ital,wght@0,400..700;1,400..700&family=VT323&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
