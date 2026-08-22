import type { Metadata } from "next";
import Link from "next/link";
import { inviteInfo } from "@/lib/auth/actions";
import { AuthShell } from "@/components/auth-shell";
import { JoinScreen } from "./join-screen";

export const metadata: Metadata = { title: "הצטרפות לסטודיו · Eve" };

// The invitation is resolved on the SERVER, before anything renders. Two reasons: the person sees
// which studio invited them and which address it was sent to without a loading flash, and a dead
// link renders as a dead link rather than as a form that fails on submit.
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await inviteInfo(token);

  if (!invite) {
    return (
      <AuthShell
        title="הקישור אינו בתוקף"
        lede="ההזמנה הזו פגה, כבר נוצלה, או שהקישור הועתק חלקית. בקשו מהסטודיו קישור חדש — זו פעולה של לחיצה אחת אצלם."
        footer={
          <Link href="/login" className="font-semibold text-accent hover:underline">
            יש לכם כבר חשבון? כניסה
          </Link>
        }
      >
        <div />
      </AuthShell>
    );
  }

  return <JoinScreen token={token} email={invite.email} name={invite.name ?? ""} studioName={invite.studioName} />;
}
