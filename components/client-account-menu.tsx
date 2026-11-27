"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Trash2, UserRound } from "lucide-react";
import { Menu } from "./menu";
import { DeleteAccountDialog } from "./delete-account-dialog";
import { signOut } from "@/lib/auth/actions";

// The client's account, in every client header (EVE-22, spec §5.6; the board's ClientMenu): who is
// signed in, יציאה, and deleting their login. Deleting it ends their part — the event stays the
// studio's, and requests about its details go to the studio.
export function ClientAccountMenu({ name, email, needsPassword }: { name: string | null; email: string; needsPassword: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const leave = async () => {
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <>
      <Menu
        label="החשבון שלי"
        trigger="chip"
        icon={UserRound}
        triggerText={name || "החשבון שלי"}
        heading={email}
        panelClassName="w-[232px]"
        items={[
          { label: "יציאה", icon: LogOut, onSelect: () => void leave() },
          { label: "מחיקת הכניסה שלי", icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(true) },
        ]}
      />
      <DeleteAccountDialog open={deleting} onClose={() => setDeleting(false)} who="client" email={email} needsPassword={needsPassword} />
    </>
  );
}
