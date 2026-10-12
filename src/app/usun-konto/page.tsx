import { LegalDocumentPage, legalDocumentMetadata } from "@/components/legal-document-page";

export const metadata = legalDocumentMetadata("usun-konto");

/** Jak poprosić o usunięcie konta i danych: publicznie, bez logowania i bez formularza (wymóg Google Play). */
export default function DeleteAccountPage() {
  return <LegalDocumentPage id="usun-konto" />;
}
