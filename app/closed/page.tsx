import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth/guard";
import { ORG_HOME } from "@/lib/auth/kinds";
import { hasPasswordLogin } from "@/lib/auth/logins";
import { retainedOf } from "@/lib/account/erase";
import { retainUntilOf } from "@/lib/account/rules";
import { ClosedScreen } from "./closed-screen";

export const metadata: Metadata = { title: "העסק נסגר · Eve" };

// Where a closed business's people land (EVE-22, spec §5.2): requireStudio sends every studio page
// here while the business waits to be erased. The owner reopens it or downloads it; a member is told
// when their account goes with it and may delete it now. Anyone else is sent where they belong.
export default async function ClosedPage() {
  const session = await requireSession();
  if (session.kind !== "studio") redirect("/client");
  if (!session.organizationId) redirect("/welcome");
  if (!session.closed) redirect(ORG_HOME[session.organizationKind ?? "studio"]);
  const owner = session.role === "owner";

  const [[org], keep, needsPassword] = await Promise.all([
    db().select({ name: organizations.name }).from(organizations).where(eq(organizations.id, session.organizationId)).limit(1),
    // The same retained set the sweep keeps — the owner is told how long the documents stay.
    owner ? retainedOf(db(), session.organizationId) : Promise.resolve(null),
    owner ? Promise.resolve(false) : hasPasswordLogin(session.userId),
  ]);

  return (
    <ClosedScreen
      owner={owner}
      name={org?.name ?? ""}
      email={session.email}
      closedAt={session.closed.closedAt}
      eraseAfter={session.closed.eraseAfter}
      due={session.closed.state === "due"}
      retainUntil={keep ? retainUntilOf(keep.docDates) : null}
      home={ORG_HOME[session.organizationKind ?? "studio"]}
      needsPassword={needsPassword}
    />
  );
}
