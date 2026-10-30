"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Ban, Check, Download, FileMinus, Printer, Send, Share2, TriangleAlert } from "lucide-react";
import type { BusinessSettings } from "@/lib/settings/types";
import { cancelDocument, markOriginal, markSent, setAllocationNumber, type DocumentView as View } from "@/lib/billing/actions";
import { cancelRefusal, validAllocationNumber } from "@/lib/billing/rules";
import { STATUS_LABEL, documentName, isFiscal, type BillingDocument } from "@/lib/billing/types";
import { formatEventDate } from "@/lib/events/types";
import { Button } from "@/components/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Popover } from "@/components/popover";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";
import { buildQuotePdf, downloadFile, quoteFileName, shareFile } from "../../outputs/quote-pdf";
import { CreditDialog } from "../../dashboard/billing-dialogs";
import { DocumentPage, type Stamp } from "../document-page";

// THE DOCUMENT'S SCREEN: the page, and above it the few things the law lets happen to a document
// after it has a number.
//
//   הדפסת מקור   once. Marks the original as produced (markOriginal), prints with "מקור", and from
//                then on every print and every file says "העתק" and the document can no longer be
//                cancelled in place.
//   הדפסה / PDF  copies. The PDF is built like the quote's (../../outputs/quote-pdf.ts) and shared
//                through the device's sheet; a share that went out is recorded as sent.
//   נשלח         by hand, to whom — the record that the document left the studio.
//   מספר הקצאה   typed off the Tax Authority's site while the API is not wired.
//   ביטול        under the narrow rule (lib/billing/rules.ts cancelRefusal); else —
//   חשבונית זיכוי the way every other correction is made.
export function DocumentView({ view, settings, venueName }: { view: View; settings: BusinessSettings; venueName?: string }) {
  const [doc, setDoc] = useState<BillingDocument>(view.document);
  const [credits, setCredits] = useState<BillingDocument[]>(view.credits);
  const [printing, setPrinting] = useState<"original" | "copy" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [allocation, setAllocation] = useState("");
  const [sentTo, setSentTo] = useState("");
  const pagesRef = useRef<HTMLDivElement>(null);

  const fiscal = isFiscal(doc.kind);
  const dead = doc.status === "cancelled" || doc.status === "superseded";
  // What the page wears right now: "מקור" only while the original print runs; "העתק" on every
  // fiscal rendering after the original exists; nothing on a draft view or a non-fiscal kind.
  const stamp: Stamp = !fiscal ? null : printing === "original" ? "original" : doc.originalAt ? "copy" : null;
  const refusal = cancelRefusal(doc, view.today);
  const creditable = (doc.kind === "tax_invoice" || doc.kind === "tax_invoice_receipt" || doc.kind === "receipt") && !dead;

  // The stamp the print carried comes off once the print dialog closes.
  useEffect(() => {
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done);
    return () => window.removeEventListener("afterprint", done);
  }, []);

  const settle = async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    await document.fonts?.ready;
    await frame();
    await frame();
    await new Promise((r) => setTimeout(r, 120));
  };

  const printOriginal = async () => {
    setBusy("print");
    try {
      const updated = await markOriginal(doc.id);
      setDoc(updated);
      setPrinting("original");
      await settle();
      window.print();
    } catch {
      setNotice({ tone: "warn", text: "הפקת המקור נכשלה — נסו שוב" });
    } finally {
      setBusy(null);
    }
  };

  const printCopy = async () => {
    setPrinting("copy");
    await settle();
    window.print();
  };

  const makePdf = async () => {
    setPrinting("copy");
    await settle();
    const pages = [...(pagesRef.current?.querySelectorAll<HTMLElement>("[data-quote-page]") ?? [])];
    const file = await buildQuotePdf(pages, quoteFileName(doc.customer.name, doc.documentDate, documentName(doc)), { title: documentName(doc), author: settings.businessName });
    setPrinting(null);
    return file;
  };

  const share = async () => {
    setBusy("pdf");
    setNotice(null);
    try {
      const file = await makePdf();
      const outcome = await shareFile(file, `${documentName(doc)} — ${doc.customer.name}`);
      if (outcome === "shared") {
        setDoc(await markSent(doc.id, "שיתוף PDF"));
        setNotice({ tone: "ok", text: "המסמך שותף ונרשם כנשלח (העתק)" });
      } else if (outcome === "downloaded") setNotice({ tone: "ok", text: "הדפדפן לא תומך בשיתוף קבצים — ה-PDF הורד" });
      else if (outcome === "blocked") setNotice({ tone: "warn", text: "ה-PDF מוכן — לחצו שוב על שיתוף" });
    } catch (e) {
      console.error("document PDF failed", e);
      setNotice({ tone: "warn", text: "הפקת ה-PDF נכשלה — נסו שוב" });
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setBusy("pdf");
    try {
      downloadFile(await makePdf());
    } catch {
      setNotice({ tone: "warn", text: "הפקת ה-PDF נכשלה — נסו שוב" });
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setCancelOpen(false);
    setBusy("cancel");
    try {
      const out = await cancelDocument(doc.id, "");
      if ("error" in out) setNotice({ tone: "warn", text: out.error });
      else setDoc(out);
    } finally {
      setBusy(null);
    }
  };

  const saveAllocation = async () => {
    setBusy("allocation");
    try {
      const out = await setAllocationNumber(doc.id, allocation);
      if ("error" in out) setNotice({ tone: "warn", text: out.error });
      else {
        setDoc(out);
        setAllocation("");
      }
    } finally {
      setBusy(null);
    }
  };

  const tone = dead ? "neutral" : doc.status === "sent" ? "success" : doc.originalAt ? "accent" : "warn";
  const statusWord = dead ? STATUS_LABEL[doc.status] : doc.status === "sent" ? "נשלח" : doc.originalAt ? "מקור הופק" : fiscal ? "טרם נמסר" : "הופק";

  return (
    <div className="flex w-full flex-col items-center gap-5 px-8 pb-10 pt-6">
      {/* Browser print of ONE A4 box, margins owned by the page itself, like the quote. */}
      <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>

      <div className="no-print w-full space-y-3 rounded-md border border-border bg-surface px-5 py-4 shadow-floating" style={{ maxWidth: "210mm" }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href="/billing" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
              <ArrowRight className="h-4 w-4" strokeWidth={2} />
              חשבונות
            </Link>
            <h2 className="font-display text-h2 text-ink">{documentName(doc)}</h2>
            <StatusChip tone={tone}>{statusWord}</StatusChip>
            {doc.allocationStatus === "pending" && <StatusChip tone="warn">ללא מספר הקצאה</StatusChip>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {fiscal && !doc.originalAt && !dead && (
              <Button size="sm" onClick={() => void printOriginal()} disabled={!!busy} title="מדפיס את המקור — פעם אחת; אחריו כל הדפסה היא העתק">
                <Printer className="h-4 w-4" strokeWidth={2} />
                הדפסת מקור
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void printCopy()} disabled={!!busy}>
              <Printer className="h-4 w-4" strokeWidth={2} />
              {fiscal && doc.originalAt ? "הדפסת העתק" : "הדפסה"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void download()} disabled={!!busy}>
              <Download className="h-4 w-4" strokeWidth={2} />
              PDF
            </Button>
            <Button variant={fiscal && !doc.originalAt ? "outline" : "primary"} size="sm" onClick={() => void share()} disabled={!!busy}>
              <Share2 className="h-4 w-4" strokeWidth={2} />
              {busy === "pdf" ? "מכין PDF…" : "שיתוף PDF"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-3 text-caption text-ink-soft">
          <span className="nums">
            {view.event.clientName} · {formatEventDate(view.event.date)}
          </span>
          {doc.originalAt && <span className="nums">המקור הופק {new Date(doc.originalAt).toLocaleDateString("he-IL")}</span>}
          {doc.sentAt && (
            <span className="nums">
              נשלח {new Date(doc.sentAt).toLocaleDateString("he-IL")}
              {doc.sentTo ? ` · ${doc.sentTo}` : ""}
            </span>
          )}
          {doc.cancelledAt && <span className="nums">בוטל {new Date(doc.cancelledAt).toLocaleDateString("he-IL")}</span>}
          {doc.supersededById && (
            <Link href={`/billing/${doc.supersededById}`} className="text-accent hover:underline">
              להזמנה שהחליפה אותה ↗
            </Link>
          )}
          {view.follows && (
            <Link href={`/billing/${view.follows.id}`} className="text-accent hover:underline">
              {doc.kind === "credit" ? "לחשבונית המזוכה" : "למסמך שלפניו"} ↗
            </Link>
          )}
          {credits.length > 0 && <span>{credits.length === 1 ? "זוכתה בחשבונית זיכוי" : `${credits.length} חשבוניות זיכוי`}</span>}
          {notice && (
            <span className={"inline-flex items-center gap-1.5 " + (notice.tone === "warn" ? "text-warn-ink" : "text-success-ink")}>
              {notice.tone === "warn" ? <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} /> : <Check className="h-3.5 w-3.5" strokeWidth={2.5} />}
              {notice.text}
            </span>
          )}
        </div>

        {!dead && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {!doc.sentAt && (
              <Popover label="סימון כנשלח" icon={Send} side="bottom" panelClassName="w-72">
                {(close) => (
                  <div className="space-y-3">
                    <TextField label="נמסר ל…" value={sentTo} onChange={setSentTo} placeholder="ביד / וואטסאפ / מייל" />
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={async () => {
                        setDoc(await markSent(doc.id, sentTo));
                        close();
                      }}
                    >
                      המסמך נמסר ללקוח
                    </Button>
                    <p className="text-[12.5px] leading-relaxed text-muted">{fiscal ? "מסמך שנמסר אינו ניתן לביטול — רק לזיכוי." : "ההזמנה נרשמת כנמסרה."}</p>
                  </div>
                )}
              </Popover>
            )}
            {doc.allocationStatus === "pending" && (
              <Popover label="מספר הקצאה" icon={TriangleAlert} side="bottom" panelClassName="w-80">
                {(close) => (
                  <div className="space-y-3">
                    <TextField label="מספר הקצאה (9 ספרות)" dir="ltr" value={allocation} onChange={(v) => setAllocation(v.replace(/\D/g, "").slice(0, 9))} className="text-end" />
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!validAllocationNumber(allocation) || !!busy}
                      onClick={async () => {
                        await saveAllocation();
                        close();
                      }}
                    >
                      שמירה על המסמך
                    </Button>
                    <p className="text-[12.5px] leading-relaxed text-muted">מתקבל באזור האישי ברשות המסים (חשבוניות ישראל) עבור החשבונית הזו. בלעדיו הלקוח לא יוכל לקזז את המע״מ.</p>
                  </div>
                )}
              </Popover>
            )}
            {creditable && (
              <Button variant="outline" size="sm" onClick={() => setCreditOpen(true)} disabled={!!busy}>
                <FileMinus className="h-4 w-4" strokeWidth={2} />
                חשבונית זיכוי
              </Button>
            )}
            {refusal === null ? (
              <Button variant="danger" size="sm" onClick={() => setCancelOpen(true)} disabled={!!busy}>
                <Ban className="h-4 w-4" strokeWidth={2} />
                ביטול המסמך
              </Button>
            ) : (
              fiscal && <span className="text-caption text-muted">{refusal}</span>
            )}
          </div>
        )}
      </div>

      <div ref={pagesRef} className="flex flex-col items-center print:block">
        <DocumentPage document={doc} settings={settings} event={view.event} venueName={venueName} follows={view.follows} bankDetails={view.bankDetails} stamp={stamp} />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        title={`לבטל את ${documentName(doc)}?`}
        body="המסמך יסומן ״מבוטל״, מספרו יישמר ברצף והוא יישאר בספרים. אי אפשר להחזיר ביטול."
        confirmLabel="ביטול המסמך"
        onConfirm={() => void cancel()}
        onClose={() => setCancelOpen(false)}
      />
      {creditOpen && (
        <CreditDialog
          invoice={doc}
          credits={credits}
          today={view.today}
          onClose={() => setCreditOpen(false)}
          onDone={(c) => {
            setCreditOpen(false);
            setCredits((list) => [...list, c]);
            setNotice({ tone: "ok", text: `הופקה ${documentName(c)}` });
          }}
        />
      )}
    </div>
  );
}
