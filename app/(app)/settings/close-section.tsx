"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, DoorClosed, Image as ImageIcon, Link2Off, LogOut, Package, Share2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TextField } from "@/components/text-field";
import { ExportButton, type AccountExport } from "@/components/account-export";
import { closeBusiness, fetchClosePreview, type ClosePreview } from "@/lib/account/actions";
import { CLOSE_GRACE_DAYS, eraseAfterOf, nameConfirms } from "@/lib/account/rules";
import { named } from "@/lib/account/words";
import { Panel } from "./ui";

// סגירת העסק (EVE-22, spec §5.2) — the owner's way out. Closing LOCKS the business at once (the team
// signed out, clients and 3D links dark, its venues take no new events) and the sweep erases it after
// the grace period; until then the owner reopens it from /closed. What the law keeps — the issued
// billing documents — and the venues other businesses still use are said, by name and date, before
// anything is pressed. The export sits first: it is the thing to do before closing.

const dateLabel = (d: Date | string) =>
  new Date(d).toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jerusalem" });
const yearOf = (iso: string) => iso.slice(0, 4);
const n = (x: number) => x.toLocaleString("he-IL");

export function CloseSection({ exporter }: { exporter: AccountExport }) {
  const router = useRouter();
  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [typed, setTyped] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchClosePreview()
      .then((p) => live && setPreview(p))
      .catch(() => live && setError("לא ניתן לקרוא את פרטי העסק כרגע"));
    return () => {
      live = false;
    };
  }, []);

  const eraseOn = dateLabel(eraseAfterOf(new Date()));
  const matches = !!preview && nameConfirms(typed, preview.name);

  const close = async () => {
    setAsking(false);
    setBusy(true);
    setError(null);
    try {
      const result = await closeBusiness({ confirmName: typed });
      if ("error" in result) {
        setError(result.error);
        setBusy(false);
        return;
      }
      router.replace("/closed");
      router.refresh();
    } catch {
      setError("לא ניתן לסגור את העסק כרגע");
      setBusy(false);
    }
  };

  return (
    <Panel title="סגירת העסק" hint={`לבעלים בלבד. אפשר לחזור בה במשך ${CLOSE_GRACE_DAYS} יום.`}>
      <div className="flex max-w-3xl flex-col gap-5">
        <p className="text-[15px] leading-relaxed text-ink-soft text-pretty">
          סגירה נועלת את העסק מיד. במשך {CLOSE_GRACE_DAYS} יום אפשר לפתוח אותו מחדש כמו שהיה; אחרי זה הוא נמחק.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Well title="מיד עם הסגירה">
            <Line icon={LogOut}>הצוות מתנתק ולא יכול להיכנס</Line>
            <Line icon={Link2Off}>הלקוחות וקישורי התלת־ממד מפסיקים להיפתח</Line>
            <Line icon={Share2}>המתחמים שלכם לא מקבלים אירועים חדשים; אירועים של עסקים אחרים שכבר בהם נשארים</Line>
          </Well>
          <Well
            title={
              <span className="text-alert-ink">
                אחרי {CLOSE_GRACE_DAYS} יום — <span className="nums">{eraseOn}</span>
              </span>
            }
            foot={preview && <Kept preview={preview} long />}
          >
            <Line icon={Trash2}>נמחקים האירועים, הסקיצות, הקטלוג, התמונות והחשבונות של הצוות</Line>
          </Well>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-md border border-border px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">קודם להוריד את הנתונים</p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-soft">
              קובץ zip אחד עם האירועים, הלקוחות, הקטלוג, מסמכי החיוב והתמונות. זמין גם אחרי הסגירה.
            </p>
          </div>
          <ExportButton exporter={exporter} />
        </div>

        <div className="flex flex-col gap-3 border-t border-border-soft pt-5">
          {preview && (
            <TextField
              label={`כדי לסגור, הקלידו את שם העסק: ${named(preview.name)}`}
              value={typed}
              onChange={setTyped}
              autoComplete="off"
              wrapperClassName="max-w-[420px]"
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              variant="danger"
              disabled={!matches || busy}
              onClick={() => setAsking(true)}
              icon={<DoorClosed className="h-4 w-4" strokeWidth={1.75} />}
            >
              {busy ? "סוגרים…" : "סגירת העסק"}
            </Button>
            {error ? (
              <p role="alert" className="text-[13px] font-medium text-alert-ink">
                {error}
              </p>
            ) : (
              !matches && <span className="text-[13px] text-muted">הכפתור פעיל רק כשהשם תואם.</span>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <ConfirmDialog
          open={asking}
          wide
          icon={DoorClosed}
          title={`לסגור את העסק ${named(preview.name)}?`}
          facts={`אפשר לפתוח מחדש עד ${eraseOn}`}
          confirmLabel="סגירת העסק"
          confirmIcon={DoorClosed}
          onConfirm={close}
          onClose={() => setAsking(false)}
          body={
            <>
              <p>הצוות, הלקוחות וקישורי התלת־ממד ננעלים עכשיו. אם לא תפתחו אותו מחדש, העסק נמחק בתאריך הזה.</p>
              <Well title={<span className="text-alert-ink">נמחק אחרי {CLOSE_GRACE_DAYS} יום</span>} foot={<Kept preview={preview} />}>
                <div className="nums grid grid-cols-2 gap-x-3 gap-y-1.5 text-ink">
                  <Count icon={CalendarDays}>{n(preview.events)} אירועים</Count>
                  <Count icon={Users}>{n(preview.members)} חברי צוות</Count>
                  <Count icon={Package}>{n(preview.products)} פריטים בקטלוג</Count>
                  <Count icon={ImageIcon}>{n(preview.photos)} תמונות</Count>
                </div>
              </Well>
              <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-border px-3.5 py-2.5">
                <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">עוד לא הורדתם את הנתונים? הקובץ זמין גם אחרי הסגירה.</span>
                <ExportButton exporter={exporter} />
              </div>
            </>
          }
        />
      )}
    </Panel>
  );
}

/** What the law and other businesses keep — the documents to a year, the venues by name. */
function Kept({ preview, long = false }: { preview: ClosePreview; long?: boolean }) {
  const parts: ReactNode[] = [];
  if (preview.retainUntil) {
    parts.push(
      long ? (
        <span key="docs">
          נשמרים לפי חוק: מסמכי החיוב שהופקו, עד סוף <span className="nums">{yearOf(preview.retainUntil)}</span>. הם לא מוצגים באפליקציה; עותק
          נשלח לפי בקשה.
        </span>
      ) : (
        <span key="docs">
          נשמרים: <span className="nums">{n(preview.documents)}</span> מסמכי חיוב עד סוף <span className="nums">{yearOf(preview.retainUntil)}</span>,
          לפי חוק
        </span>
      ),
    );
  }
  for (const v of preview.venuesKept) {
    parts.push(
      <span key={`venue-${v}`}>
        {parts.length === 0 ? "נשמר: " : ""}המתחם ״{v}״, כל עוד עסקים אחרים מקיימים בו אירועים
      </span>,
    );
  }
  if (!parts.length) return null;
  return (
    <span className="text-[12px] leading-relaxed text-ink-soft">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {p}
        </span>
      ))}
    </span>
  );
}

function Well({ title, foot, children }: { title: ReactNode; foot?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-inset-border bg-inset px-4 py-3 text-[13px] leading-relaxed">
      <span className="text-xs font-semibold text-ink">{title}</span>
      {children}
      {foot && <div className="mt-1 border-t border-inset-border pt-2">{foot}</div>}
    </div>
  );
}

function Line({ icon: Icon, children }: { icon: typeof LogOut; children: ReactNode }) {
  return (
    <span className="flex gap-2 text-ink-soft">
      <Icon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

function Count({ icon: Icon, children }: { icon: typeof LogOut; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
      {children}
    </span>
  );
}
