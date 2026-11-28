import { LegalPage, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("terms");

export default function Page() {
  return <LegalPage slug="terms" />;
}
