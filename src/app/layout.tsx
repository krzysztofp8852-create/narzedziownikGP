import type { Metadata, Viewport } from "next";
import { Barlow, JetBrains_Mono } from "next/font/google";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { t } from "@/i18n/t";
import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const plate = JetBrains_Mono({ variable: "--font-plate", subsets: ["latin", "latin-ext"], weight: ["700"] });

export const metadata: Metadata = {
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.description"),
  // iPhone: aplikacja dodana do ekranu głównego otwiera się bez paska Safari, pod nazwą NarzędziownikGP.
  appleWebApp: { capable: true, title: t("app.name"), statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={`${body.variable} ${plate.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
