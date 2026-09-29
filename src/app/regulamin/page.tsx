import { LegalDocumentPage, legalDocumentMetadata } from "@/components/legal-document-page";

export const metadata = legalDocumentMetadata("regulamin");

export default function TermsPage() {
  return <LegalDocumentPage id="regulamin" />;
}
