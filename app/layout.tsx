import type { Metadata } from "next";
import { Instrument_Sans, DM_Mono } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const dmMono = DM_Mono({
  variable: "--font-num",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "STRC Intelligence Platform",
  description:
    "Real-time monitoring and analytics for STRC preferred stock — risk dimensions, rate engine, volatility, and position management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${dmMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {children}
      </body>
    </html>
  );
}
