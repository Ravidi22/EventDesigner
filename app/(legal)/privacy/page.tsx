import { LegalPage, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalPage slug="privacy" />;
}
