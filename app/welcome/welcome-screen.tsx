"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { completeOnboarding } from "@/lib/auth/actions";
import { CHOICE_HINT, CHOICE_LABEL, CHOICE_OF } from "@/lib/auth/kinds";

/** The two businesses a studio account can open (lib/auth/kinds.ts). A client is not one of them —
 *  an event owner comes in by their designer's invitation, never through sign-up. */
type Business = "designer" | "supplier";
const BUSINESSES: Business[] = ["designer", "supplier"];

// What the business is, and two questions, one required. Everything else a quote's letterhead needs
// (registration number, address, logo) lives in settings → פרטי העסק and is asked for when it is
// first needed, not here.
export function WelcomeScreen({ name }: { name: string }) {
  const router = useRouter();
  const [business, setBusiness] = useState<Business>("designer");
  const supplier = business === "supplier";
  const [studioName, setStudioName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    if (!studioName.trim()) return setErrors({ studioName: "יש להזין שם עסק" });
    setErrors({});
    setBusy(true);
    try {
      const result = await completeOnboarding({ studioName, phone, orgKind: CHOICE_OF[business].orgKind });
      if (result.error) {
        if (result.field) setErrors({ [result.field]: result.error });
        else setFormError(result.error);
        setBusy(false);
        return;
      }
      router.replace(result.home ?? "/dashboard");
      router.refresh();
    } catch {
      setFormError("לא ניתן לשמור כרגע. נסו שוב.");
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={name ? `ברוכים הבאים, ${name.split(" ")[0]}` : "ברוכים הבאים"}
      lede={supplier ? "עוד רגע בחשבון הספק. איך קוראים לעסק?" : "עוד רגע בסטודיו. איך קוראים לעסק?"}
      footer={<span className="text-xs text-muted">את שאר פרטי העסק (ח.פ., כתובת, לוגו) אפשר להשלים בהגדרות.</span>}
    >
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3" noValidate>
        <FormError message={formError} />
        <BusinessChooser value={business} onChange={setBusiness} />
        <Field
          id="studioName"
          label="שם העסק"
          type="text"
          autoComplete="organization"
          value={studioName}
          onChange={setStudioName}
          error={errors.studioName}
          placeholder={supplier ? "שם העסק" : "סטודיו לעיצוב אירועים"}
          autoFocus
        />
        <Field
          id="phone"
          label="טלפון (לא חובה)"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={setPhone}
          error={errors.phone}
        />
        <Button
          type="submit"
          size="lg"
          aria-busy={busy}
          icon={<ArrowLeft className={`h-[18px] w-[18px] ${busy ? "arrow-run" : "arrow-nudge"}`} strokeWidth={1.8} />}
          className="group mt-1 w-full"
        >
          {busy ? (supplier ? "פותחים את החשבון…" : "פותחים את הסטודיו…") : supplier ? "כניסה לחשבון" : "כניסה לסטודיו"}
        </Button>
      </form>
    </AuthShell>
  );
}

/** A designer's studio or a supplier — a radiogroup of two cards, because the difference is a
 *  sentence, not a word. With two choices every arrow key moves to the other one, so RTL needs no
 *  mapping; only the selected card is in the Tab order. */
function BusinessChooser({ value, onChange }: { value: Business; onChange: (b: Business) => void }) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = value === "designer" ? "supplier" : "designer";
    onChange(next);
    document.getElementById(`business-${next}`)?.focus();
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span id="business-label" className="text-sm font-medium text-ink">
        מה העסק?
      </span>
      <div role="radiogroup" aria-labelledby="business-label" className="flex flex-col gap-2">
        {BUSINESSES.map((b) => {
          const selected = value === b;
          return (
            <button
              key={b}
              id={`business-${b}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(b)}
              onKeyDown={onKeyDown}
              className={
                "rounded-md border p-3 text-start transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent short:p-2.5 " +
                (selected ? "border-accent bg-accent-tint" : "border-border bg-canvas hover:border-accent-line")
              }
            >
              <span className={"block text-sm leading-tight " + (selected ? "font-bold text-accent" : "font-semibold text-ink")}>
                {CHOICE_LABEL[b]}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted">{CHOICE_HINT[b]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
