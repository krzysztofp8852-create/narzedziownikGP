import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { display } from "@/components/display-font";
import { MarkdownBlocks } from "@/components/markdown-blocks";
import { VisitorCookieConsent } from "@/components/visitor-cookie-consent";
import { VisitorContact, VisitorFooter, VisitorHeader } from "@/components/visitor-site";
import { t } from "@/i18n/t";
import { serverEnv } from "@/lib/env";
import { jsonLdScript, modulePageStructuredData } from "@/lib/structured-data";
import { MODULE_PAGE_IDS, type ModulePageId, modulePageOf, modulePagePath } from "@/module-pages/pages";
import { readModulePage } from "@/module-pages/read";

const moduleName = (id: ModulePageId) => t(`landing.features.groups.${id}.title`);

export async function generateMetadata(props: PageProps<"/funkcje/[modul]">): Promise<Metadata> {
  const id = modulePageOf((await props.params).modul);
  if (!id) return {};
  const { title, description } = await readModulePage(id);
  const path = modulePagePath(id);
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: "pl_PL",
      url: path,
      siteName: t("app.name"),
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image" },
  };
}

/**
 * Strona modułu (ADR 0046): jak działają funkcje jednej grupy ze strony o programie, z treścią z pliku
 * `messages/funkcje/<adres>.pl.md`. Otwiera się bez logowania i trafia do wyszukiwarki, a cennik, pytania
 * i kontakt zostają na stronie o programie.
 */
export default async function ModulePage(props: PageProps<"/funkcje/[modul]">) {
  const id = modulePageOf((await props.params).modul);
  if (!id) notFound();
  const page = await readModulePage(id);
  const siteUrl = serverEnv.siteUrl();
  const sections = page.blocks.flatMap((block) => (block.kind === "heading" && block.level === 2 ? [block] : []));
  const others = MODULE_PAGE_IDS.filter((other) => other !== id);
  return (
    <>
      <div className={`landing ${display.variable}`}>
        {siteUrl && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: jsonLdScript(modulePageStructuredData(siteUrl, { name: moduleName(id), path: modulePagePath(id) })) }}
          />
        )}
        <div className="landing-hazard" aria-hidden />
        <VisitorHeader sections="/" />

        <main className="landing-main module-main">
          <nav className="module-breadcrumbs" aria-label={t("modulePage.breadcrumbs")}>
            <ol>
              <li>
                <Link href="/">{t("modulePage.breadcrumbHome")}</Link>
              </li>
              <li aria-current="page">{moduleName(id)}</li>
            </ol>
          </nav>

          <header className="module-hero">
            <p className="module-kicker">
              <span className="plate">{t(`landing.features.groups.${id}.code`)}</span>
              {t("modulePage.kicker")}
            </p>
            <h1 className="landing-heading">{page.heading}</h1>
            <p className="landing-lead">{page.lead}</p>
            <div className="landing-actions">
              <Link href="/demo" className="button">
                {t("landing.hero.demo")}
              </Link>
              <Link href="/#cennik" className="button button-quiet">
                {t("modulePage.pricing")}
              </Link>
            </div>
          </header>

          <div className="module-body">
            <nav className="module-contents" aria-label={t("modulePage.contents")}>
              <p>{t("modulePage.contents")}</p>
              <ol>
                {sections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
            <article className="module-article">
              <MarkdownBlocks blocks={page.blocks} />
            </article>
          </div>

          <section className="landing-section" aria-labelledby="pozostale-moduly">
            <h2 id="pozostale-moduly" className="landing-section-title">
              {t("modulePage.others")}
            </h2>
            <p className="landing-lead">{t("modulePage.othersLead")}</p>
            <ul className="module-others">
              {others.map((other) => (
                <li key={other}>
                  <Link href={modulePagePath(other)}>
                    <span className="plate">{t(`landing.features.groups.${other}.code`)}</span>
                    <strong>{moduleName(other)}</strong>
                    <span className="muted">{t(`landing.features.groups.${other}.text`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </main>

        <VisitorContact />
        <VisitorFooter />
      </div>
      <VisitorCookieConsent />
    </>
  );
}
