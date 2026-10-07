import type { Metadata, Viewport } from "next";
import { Barlow, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegistration } from "@/components/service-worker-registration";
import { t } from "@/i18n/t";
import { serverEnv } from "@/lib/env";
import { GOOGLE_ADS_ID, GOOGLE_ANALYTICS_ID } from "@/lib/google-tags";
import "./globals.css";

const body = Barlow({ variable: "--font-body", subsets: ["latin", "latin-ext"], weight: ["400", "500", "600", "700"] });
const plate = JetBrains_Mono({ variable: "--font-plate", subsets: ["latin", "latin-ext"], weight: ["700"] });

const siteUrl = serverEnv.siteUrl();
const googleSiteVerification = serverEnv.googleSiteVerification();

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: { default: t("app.name"), template: `%s · ${t("app.name")}` },
  description: t("app.description"),
  // W wyszukiwarce tylko strona o programie (ona sama to nadpisuje); aplikacji i demo tam nie ma.
  robots: { index: false },
  verification: googleSiteVerification ? { google: googleSiteVerification } : undefined,
  openGraph: { siteName: t("app.name"), locale: "pl_PL", images: [{ url: "/og.png", width: 1200, height: 630 }] },
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
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`} strategy="afterInteractive" />
        {/*
         * Google Ads tylko mierzy konwersje (formularz „oddzwonimy”), bez ciasteczek reklamowych: przy odmowie
         * ad_storage Google dostaje pingi bez ciasteczek i modeluje konwersje.
         */}
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
gtag('js', new Date());
gtag('config', '${GOOGLE_ANALYTICS_ID}');
gtag('config', '${GOOGLE_ADS_ID}');`}
        </Script>
      </body>
    </html>
  );
}
