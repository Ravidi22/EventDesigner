import { LegalPage, legalMetadata } from "../legal-page";

export const metadata = legalMetadata("accessibility");

export default function Page() {
  return <LegalPage slug="accessibility" />;
}
