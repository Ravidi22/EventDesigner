"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/button";
import { AuthShell, Field, FormError } from "@/components/auth-shell";
import { signIn, signInFromForm, startGoogleSignIn } from "@/lib/auth/actions";
import { KIND_ENTRY, isAccountKind } from "@/lib/auth/kinds";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `?google=` from app/api/auth/google/callback, in Hebrew. A cancel is not an error and says nothing. */
const GOOGLE_OUTCOME: Record<string, string> = {
  // One line each: this screen fits one viewport, and the way onward is already on it.
  "no-account": "לא נמצא חשבון עם כתובת ה-Google הזו.",
  invited: "הכתובת הזו הוזמנה לסטודיו. הצטרפו דרך קישור ההזמנה שקיבלתם.",
  unverified: "Google לא אימת את כתובת האימייל של החשבון הזה.",
  expired: "הכניסה עם Google לא הושלמה בזמן. נסו שוב.",
  failed: "הכניסה עם Google נכשלה. נסו שוב.",
};

/** Google's own mark, in its own colours — the one place a brand's colours are not ours to restyle. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

// A real sign-in: the action sets an httpOnly session cookie and this screen navigates. The
// front-end shell that used to route straight to /dashboard without establishing anything is gone.
export function LoginScreen({ google }: { google: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("kind");
  const kind = isAccountKind(asked) ? asked : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Off until asked for: the studio's laptop is often the one on the venue's desk.
  const [remember, setRemember] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  // What the Google callback sent them back with, if it sent them back.
  // …or what signInFromForm did, when the form had to post itself.
  const [formError, setFormError] = useState<string | null>(
    GOOGLE_OUTCOME[params.get("google") ?? ""] ??
      (params.get("error") === "credentials" ? "האימייל או הסיסמה שגויים" : null),
  );
  // WHICH door is being walked through, not just that one is: the arrow runs on the button that
  // was pressed, and the other one waits.
  const [busy, setBusy] = useState<"password" | "google" | null>(null);

  const withGoogle = async () => {
    setFormError(null);
    setBusy("google");
    try {
      const result = await startGoogleSignIn({ remember, next: params.get("next") });
      if ("error" in result) {
        setFormError(result.error);
        setBusy(null);
        return;
      }
      // A real navigation, off this site: Google's screen is not a route.
      window.location.assign(result.url);
    } catch {
      setFormError("לא ניתן להתחבר כרגע. נסו שוב.");
      setBusy(null);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // The button stays at full strength while it works (a greyed-out button is the wrong picture
    // of "on your way in"), so the second press is refused here instead of by `disabled`.
    if (busy) return;
    setFormError(null);

    // Shape only. Whether the account exists is the server's to answer, and it answers with one
    // message for both halves on purpose — see signIn().
    const next: typeof fieldErrors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "כתובת אימייל לא תקינה";
    if (!password) next.password = "יש להזין סיסמה";
    setFieldErrors(next);
    if (Object.keys(next).length) return;

    setBusy("password");
    try {
      const result = await signIn({ email, password, remember });
      if (result.error) {
        setFormError(result.error);
        setBusy(null);
        return;
      }
      // Where the guard sent them from, if anywhere; otherwise wherever this KIND of account
      // belongs, which only the server knows. Only ever a PATH — the guard writes one and this
      // refuses anything else, so `?next=https://elsewhere` cannot turn a sign-in into a redirect
      // off this site.
      const requested = params.get("next");
      const home = result.home ?? "/dashboard";
      const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : home;
      // refresh() so the shell re-renders as the signed-in user rather than from the cache it built
      // a moment ago, when nobody was.
      router.replace(destination);
      router.refresh();
    } catch {
      setFormError("לא ניתן להתחבר כרגע. נסו שוב.");
      setBusy(null);
    }
  };

  return (
    <AuthShell
      // Which door they came in by, when they came in by one (the landing page's entry menu). It
      // changes the words and where "new account" leads — never the form, which signs in whoever
      // the account turns out to be.
      title={kind ? KIND_ENTRY[kind] : "כניסה לחשבון"}
      lede="הזינו את פרטי החשבון כדי להמשיך לסטודיו."
      footer={
        <>
          עדיין אין לכם חשבון?{" "}
          <Link
            href={kind ? `/signup?kind=${kind}` : "/signup"}
            className="font-medium text-accent transition-colors hover:text-accent-hover"
          >
            {kind === "client" ? "יצירת חשבון חדש" : "יצירת סטודיו חדש"}
          </Link>
        </>
      }
    >
      {/* `action` is the fallback and `onSubmit` the normal path: hydrated, onSubmit prevents the
          default and the action never fires; not hydrated, the browser posts the form to it. */}
      <form
        action={signInFromForm}
        onSubmit={submit}
        className="mt-6 flex flex-col gap-4 short:mt-4 short:gap-3"
        noValidate
      >
        <input type="hidden" name="next" value={params.get("next") ?? ""} />
        <FormError message={formError} />
        <Field
          id="email"
          label="אימייל"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          placeholder="you@studio.co.il"
          autoFocus
        />
        <Field
          id="password"
          label="סיסמה"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
        />

        <label className="flex items-center gap-2.5 self-start text-sm text-ink">
          <input
            type="checkbox"
            name="remember"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          זכור אותי
        </label>

        <Button
          type="submit"
          size="lg"
          disabled={busy === "google"}
          aria-busy={busy === "password"}
          icon={
            <ArrowLeft
              className={`h-[18px] w-[18px] ${busy === "password" ? "arrow-run" : "arrow-nudge"}`}
              strokeWidth={1.8}
            />
          }
          className="group mt-1 w-full"
        >
          {busy === "password" ? "מתחברים…" : "כניסה"}
        </Button>

        {google && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
              <span className="h-px flex-1 bg-border" />
              או
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" size="lg" disabled={busy !== null} onClick={withGoogle} icon={<GoogleMark />} className="w-full short:h-11">
              המשך עם Google
            </Button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
