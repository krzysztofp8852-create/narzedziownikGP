import type { Metadata, Viewport } from "next";
import { Barlow, Barlow_Condensed, JetBrains_Mono } from "next/font/google";
import { t } from "@/i18n/t";
import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const display = Barlow_Condensed({ variable: "--font-display", subsets: ["latin", "latin-ext"], weight: ["700", "800"] });
const plate = JetBrains_Mono({ variable: "--font-plate", subsets: ["latin", "latin-ext"], weight: ["700"] });

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.description"),
};

export const viewport: Viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${body.variable} ${display.variable} ${plate.variable}`}>
      <body>{children}</body>
    </html>
  );
}
