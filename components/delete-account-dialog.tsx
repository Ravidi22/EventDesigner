"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "./button";
import { TextField } from "./text-field";
import { MODAL_CLASS, ModalFooter, ModalHeader, ModalStatus } from "./modal-frame";
import { deleteMyAccount } from "@/lib/auth/actions";
import { named } from "@/lib/account/words";

// A person deletes their own account (EVE-22, spec §5.6): a team member — from their settings, or
// from /closed while their business waits to be erased — or a client, their login. Never the owner:
// their way out is closing the business (lib/auth/actions.ts deleteMyAccount refuses them, and so
// does Better Auth's beforeDelete). The password is asked when the account has one — a session
// cookie is a bearer token, and a borrowed laptop must not be enough to erase someone.
//
// Not ConfirmDialog: that one closes on the press and reports nothing, and this one has to wait for
// the answer and say "the password is wrong" in place.

export function DeleteAccountDialog({
  open,
  onClose,
  who,
  email,
  studioName,
  needsPassword,
}: {
  open: boolean;
  onClose: () => void;
  /** member = a studio account (their work stays in the studio); client = a client's login. */
  who: "member" | "client";
  email: string;
  /** The studio their work stays in — said by name to a member. */
  studioName?: string;
  /** The account signs in with a password (not only with Google). */
  needsPassword: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPassword("");
      setError(null);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (needsPassword && !password) return setError("יש להזין את הסיסמה");
    setBusy(true);
    setError(null);
    try {
      const result = await deleteMyAccount({ password });
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setError("המחיקה לא הצליחה");
      setBusy(false);
    }
  };

  const member = who === "member";
  return (
    <dialog
      ref={ref}
      // A busy delete is not abandoned by Escape: the answer is on its way.
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="delete-account-title"
      className={MODAL_CLASS}
    >
      <form onSubmit={submit} className="w-[min(92vw,27.5rem)] text-right">
        <ModalHeader
          tile={<Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />}
          tileClassName="bg-alert-tint text-alert-ink"
          titleId="delete-account-title"
          title={<span className="whitespace-normal leading-snug">{member ? "למחוק את החשבון שלכם?" : "למחוק את הכניסה שלכם ל־Eve?"}</span>}
          facts={member ? <span dir="ltr">{email}</span> : undefined}
          onClose={busy ? undefined : onClose}
          closeTabIndex={-1}
        />
        <div className="flex flex-col gap-3.5 px-5 pb-5 pt-[18px] text-sm leading-relaxed text-ink-soft">
          <p>
            {member
              ? `החשבון נמחק לצמיתות ואתם מתנתקים. האירועים, הסקיצות והמסמכים שעבדתם עליהם נשארים בסטודיו${studioName ? ` של ${named(studioName)}` : ""}.`
              : "לא תוכלו עוד לראות את הסקיצה ואת התלת־ממד או להציע שינויים. פרטי האירוע אצל הסטודיו לא משתנים — הם של הסטודיו, ובקשות לגביהם מופנות אליו."}
          </p>
          {needsPassword && (
            <TextField
              label="הסיסמה שלכם, לאישור"
              type="password"
              dir="ltr"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              className="text-end"
            />
          )}
        </div>
        {/* ביטול first and filled: showModal() focuses it, so one Enter cannot erase anybody. */}
        <ModalFooter>
          <Button size="sm" variant="primary" onClick={onClose} disabled={busy}>
            ביטול
          </Button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-pill px-4 text-[13px] font-bold text-alert-ink transition-colors hover:bg-alert-tint disabled:opacity-50"
          >
            <Trash2 className="h-[15px] w-[15px]" strokeWidth={2} />
            {busy ? "מוחקים…" : member ? "מחיקה לצמיתות" : "מחיקת הכניסה"}
          </button>
          {error && <ModalStatus tone="alert">{error}</ModalStatus>}
        </ModalFooter>
      </form>
    </dialog>
  );
}
