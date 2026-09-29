import { LegalDocumentPage, legalDocumentMetadata } from "@/components/legal-document-page";

export const metadata = legalDocumentMetadata("umowa-powierzenia");

export default function DataProcessingAgreementPage() {
  return <LegalDocumentPage id="umowa-powierzenia" />;
}
