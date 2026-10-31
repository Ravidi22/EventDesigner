import { redirect } from "next/navigation";
import { requireHost } from "@/lib/auth/guard";
import { fetchLedger } from "@/lib/billing/actions";
import { BillingScreen } from "./billing-screen";

// חשבונות — the studio's own books: every billing document (lib/billing) over a month, with the
// month's totals and the export the accountant asks for.
//
// Owners and designers only. A crew member sees the work and never a price (ROLE_CAPABILITIES),
// and this screen is nothing but prices — so the role is checked HERE, on the server, not hidden
// with a class: fetchLedger refuses the crew role too.
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await requireHost();
  if (session.role === "crew") redirect("/dashboard");
  const params = await searchParams;
  const month = Array.isArray(params.month) ? params.month[0] : params.month;
  const ledger = await fetchLedger(month);
  return <BillingScreen ledger={ledger} />;
}
