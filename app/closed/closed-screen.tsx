"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/button";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { ExportButton, useAccountExport } from "@/components/account-export";
import { reopenBusiness } from "@/lib/account/actions";
import { signOut } from "@/lib/auth/actions";
import { named } from "@/lib/account/words";

// The closed business's one screen (EVE-22, spec §5.2; the board's ClosedOwner / ClosedMember). The
// owner: reopen — the one filled button — or download everything, until the erase date. A member: the
// business is gone for them; their account goes with it on that date, or now, if they ask.

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });

export function ClosedScreen({
  owner,
  name,
  email,
  closedAt,
  eraseAfter,
  due,
  retainUntil,
  home,
  needsPassword,
}: {
  owner: boolean;
  name: string;
  email: string;
  closedAt: string;
  eraseAfter: string;
  /** The erase date has passed and the sweep has not run yet — still reopenable (DECIDE-2). */
  due: boolean;
  /** The last day the billing documents are kept; null = none issued. The owner's line only. */
  retainUntil: string | null;
  home: string;
  needsPassword: boolean;
}) {
  const router = useRouter();
  const exporter = useAccountExport();
  const [busy, setBusy] = useState<"reopen" | "leave" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const reopen = async () => {
    setBusy("reopen");
    setError(null);
    try {
      const result = await reopenBusiness();
      if ("error" in result) {
        setError(result.error);
        setBusy(null);
        return;
      }
      router.replace(home);
      router.refresh();
    } catch {
      setError("לא ניתן לפתוח את העסק כרגע");
      setBusy(null);
    }
  };

  const leave = async () => {
    setBusy("leave");
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  const eraseOn = due ? "בימים הקרובים" : dateLabel(eraseAfter);
  const signOutLink = (
    <button type="button" onClick={leave} disabled={busy === "leave"} className="font-semibold text-accent hover:underline disabled:opacity-50">
      יציאה
    </button>
  );

  return (
    <AuthShell
      tagline={false}
      title="העסק נסגר"
      lede={
        owner
          ? `${named(name)} נסגר ב־${dateLabel(closedAt)}. הצוות והלקוחות כבר לא נכנסים.`
          : `הבעלים סגרו את ${named(name)} ב־${dateLabel(closedAt)}. אין עוד גישה לאירועים, לקטלוג או ללקוחות.`
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          <span>{owner ? "פתיחה מחדש מחזירה את הכל כמו שהיה, לכל הצוות." : "שאלות על העסק — לבעלים."}</span>
          {signOutLink}
        </div>
      }
    >
      <div className="mt-6 flex flex-col gap-2 rounded-md border border-inset-border bg-inset px-4 py-3 text-[13px] leading-relaxed">
        {owner ? (
          <>
            <Fact label="יימחק">
              <b className="nums text-ink">{eraseOn}</b>
            </Fact>
            <Fact label="עד אז אפשר">
              <span className="text-ink">לפתוח מחדש או להוריד הכל</span>
            </Fact>
            {retainUntil && (
              <span className="mt-1 border-t border-inset-border pt-2 text-xs text-ink-soft">
                מסמכי החיוב נשמרים לפי חוק עד סוף <span className="nums">{retainUntil.slice(0, 4)}</span> גם אחרי המחיקה.
              </span>
            )}
          </>
        ) : (
          <>
            <Fact label="החשבון שלכם יימחק עם העסק">
              <b className="nums text-ink">{eraseOn}</b>
            </Fact>
            <span className="mt-1 border-t border-inset-border pt-2 text-xs text-ink-soft">
              אם הבעלים יפתחו את העסק מחדש לפני כן, תוכלו להיכנס כרגיל. אפשר גם למחוק את החשבון עכשיו ולפנות את כתובת המייל.
            </span>
          </>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        {owner ? (
          <>
            <Button
              size="md"
              onClick={reopen}
              disabled={busy === "reopen"}
              icon={<RotateCcw className="h-4 w-4" strokeWidth={1.8} />}
              className="w-full"
            >
              {busy === "reopen" ? "פותחים…" : "פתיחה מחדש"}
            </Button>
            <ExportButton exporter={exporter} size="md" className="items-stretch" />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-pill border-[1.5px] border-alert-tint text-sm font-bold text-alert-ink transition-colors hover:bg-alert-tint"
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            מחיקת החשבון עכשיו
          </button>
        )}
        {error && (
          <p role="alert" className="text-center text-[13px] font-medium text-alert-ink">
            {error}
          </p>
        )}
      </div>

      {!owner && (
        <DeleteAccountDialog
          open={deleting}
          onClose={() => setDeleting(false)}
          who="member"
          email={email}
          studioName={name}
          needsPassword={needsPassword}
        />
      )}
    </AuthShell>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex justify-between gap-3 text-ink-soft">
      <span>{label}</span>
      {children}
    </span>
  );
}
