import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetScreen } from "./reset-screen";

export const metadata: Metadata = { title: "בחירת סיסמה חדשה · Eve" };

// Where a reset mail's link lands. Better Auth checks the token on the way here and sends the
// browser on with `?token=` when it is good, or `?error=` when it is not. A dead link renders as a
// dead link rather than as a form that fails on submit — the same rule as /join.
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (!token || error) {
    return (
      <AuthShell
        title="הקישור אינו בתוקף"
        lede="הקישור לאיפוס הסיסמה פג, כבר נוצל, או שהועתק חלקית. אפשר לבקש קישור חדש."
        footer={
          <Link href="/forgot" className="font-medium text-accent transition-colors hover:text-accent-hover">
            בקשת קישור חדש
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }
  return <ResetScreen token={token} />;
}
