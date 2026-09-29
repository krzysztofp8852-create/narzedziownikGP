import { LegalDocumentPage, legalDocumentMetadata } from "@/components/legal-document-page";

export const metadata = legalDocumentMetadata("polityka-prywatnosci");

export default function PrivacyPolicyPage() {
  return <LegalDocumentPage id="polityka-prywatnosci" />;
}
