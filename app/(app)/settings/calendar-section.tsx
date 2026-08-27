"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, CalendarSync, Check, ExternalLink, RefreshCw } from "lucide-react";
import {
  disconnectGoogle,
  setGoogleDirections,
  startGoogleConnect,
  syncGoogleNow,
  type GoogleStatus,
} from "@/lib/google/actions";
import { redirectUriBlocks, type RedirectVerdict } from "@/lib/google/types";
import { Button } from "@/components/button";
import { Note, Panel, Row, Switch } from "./ui";

// Google Calendar (lib/google/). Two independent directions, one connect button, and a line saying
// which account is on the other end.
//
// ⚠ THIS IS A PER-PERSON SCREEN inside a per-studio settings page, and it says so out loud in the
// hint — because everything else under /settings is the business's and this one is not. The diary
// that gets pushed belongs to the whole studio; the Google account it lands in belongs to whoever
// is signed in. Two designers in one studio see two different states here, which is exactly right
// and would be baffling without the sentence explaining it.

/** What the OAuth callback route redirects back with (?google=…), in Hebrew. Each one names the
 *  thing the designer can do about it — a message that only says "failed" sends them to support. */
const OUTCOME: Record<string, { tone: "ok" | "bad"; text: string }> = {
  connected: { tone: "ok", text: "היומן חובר. הפגישות מסונכרנות." },
  cancelled: { tone: "bad", text: "החיבור בוטל." },
  failed: { tone: "bad", text: "החיבור נכשל. נסה שוב." },
  unconfigured: { tone: "bad", text: "Google Calendar אינו מוגדר בשרת." },
  "signed-out": { tone: "bad", text: "ההתחברות פגה במהלך החיבור. התחבר ונסה שוב." },
  // Deliberately not "something went wrong": this one fires when the flow was started by one
  // account and finished by another, which is the exact shape of the attack the state parameter
  // exists to stop (see lib/google/oauth.ts). Worth stating plainly.
  mismatch: { tone: "bad", text: "החיבור התחיל בחשבון אחר. התחל מחדש מהמכשיר הזה." },
};

/** The deployment's redirect URI, as a line a person can act on.
 *
 *  ⚠ A DESIGNER CANNOT FIX ANY OF THESE — they are environment variables and a Google Cloud
 *  project. The line is here anyway, because the alternative is a connect button that either does
 *  nothing or walks them through a consent screen and drops them on a dead page. Naming the two
 *  hostnames is what turns "it doesn't work" into something forwardable. */
function redirectNotice(verdict: RedirectVerdict): { tone: "warn" | "bad"; text: string } | null {
  switch (verdict.state) {
    case "ok":
      return null;
    case "preview":
      return {
        tone: "bad",
        text: "חיבור ל-Google Calendar אינו זמין בפריסת תצוגה מקדימה (preview) — לכל פריסה כזו כתובת משלה, שאינה רשומה אצל Google. יש להתחבר מהכתובת הראשית של המערכת.",
      };
    case "local-in-production":
      return {
        tone: "bad",
        text: `כתובת החזרה של Google מוגדרת לכתובת מקומית (${verdict.configured}) בעוד המערכת רצה על ${verdict.deployment}. החיבור מושבת עד שיעודכן GOOGLE_REDIRECT_URI ותירשם אותה כתובת בדיוק בפרויקט ב-Google Cloud.`,
      };
    case "host-differs":
      return {
        tone: "warn",
        text: `כתובת החזרה של Google (${verdict.configured}) שונה מהכתובת שבה המערכת עונה (${verdict.deployment}). אם זו כתובת רשומה בפרויקט ב-Google Cloud — אפשר להתעלם.`,
      };
  }
}

export function CalendarSection({ initialStatus }: { initialStatus: GoogleStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [outcome, setOutcome] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [syncNote, setSyncNote] = useState("");
  const [pending, startTransition] = useTransition();

  // The callback route lands on /settings?google=…#calendar. Read it once and strip it, so a
  // refresh does not re-announce a connection made ten minutes ago.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("google");
    if (!value) return;
    setOutcome(OUTCOME[value] ?? OUTCOME.failed);
    params.delete("google");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}#calendar`);
  }, []);

  const connection = status.connection;
  const notice = redirectNotice(status.redirect);
  // Blocked means the flow cannot complete, so the button does not offer to start it. `host-differs`
  // is not blocked — it prints its line and lets the designer through, because it may be right.
  const blocked = redirectUriBlocks(status.redirect);

  const connect = () =>
    startTransition(async () => {
      const result = await startGoogleConnect();
      if ("error" in result) {
        setOutcome({ tone: "bad", text: result.error });
        return;
      }
      // A full-page navigation, not a router push: the destination is accounts.google.com, which is
      // not this app's router's to render.
      window.location.href = result.url;
    });

  const disconnect = () =>
    startTransition(async () => {
      setStatus(await disconnectGoogle());
      setOutcome(null);
      setSyncNote("");
    });

  const setDirections = (push: boolean, pull: boolean) =>
    startTransition(async () => setStatus(await setGoogleDirections(push, pull)));

  const syncNow = () =>
    startTransition(async () => {
      setSyncNote("");
      const result = await syncGoogleNow();
      setSyncNote("error" in result ? result.error : `סונכרנו ${result.pushed} פגישות.`);
    });

  if (!status.configured) {
    return (
      <Panel title="יומן Google" hint="סנכרון היומן של הסטודיו עם Google Calendar.">
        <Note icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.8} />}>
          החיבור ל-Google Calendar אינו מוגדר בשרת. יש להגדיר את משתני הסביבה של Google (ראו
          <span dir="ltr" className="mx-1 font-mono text-[12px]">
            .env.example
          </span>
          ) ולפרוס מחדש.
        </Note>
      </Panel>
    );
  }

  return (
    <Panel
      title="יומן Google"
      hint="חיבור אישי: הפגישות של הסטודיו יופיעו ביומן Google שלך, והאירועים שכבר ביומן שלך יסומנו כאן כזמן תפוס. כל חבר צוות מחבר את החשבון שלו בנפרד."
      action={
        connection ? (
          <Button size="sm" variant="outline" onClick={disconnect} disabled={pending}>
            נתק
          </Button>
        ) : (
          <Button size="sm" onClick={connect} disabled={pending || blocked}>
            <CalendarSync className="h-4 w-4" strokeWidth={1.8} />
            חבר יומן Google
          </Button>
        )
      }
    >
      {notice && (
        <div
          className={`mb-5 flex items-start gap-2 rounded-md border px-4 py-3 text-[13px] leading-relaxed ${
            notice.tone === "bad"
              ? "border-alert-tint bg-alert-tint text-alert"
              : "border-border bg-inset text-muted"
          }`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.8} />
          <span>{notice.text}</span>
        </div>
      )}

      {outcome && (
        <div
          aria-live="polite"
          className={`mb-5 flex items-center gap-2 rounded-md px-4 py-3 text-[13px] ${
            outcome.tone === "ok"
              ? "border border-accent-tint bg-accent-tint text-accent-deep"
              : "border border-alert-tint bg-alert-tint text-alert"
          }`}
        >
          {outcome.tone === "ok" ? (
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.2} />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} />
          )}
          {outcome.text}
        </div>
      )}

      {!connection ? (
        <Note>
          לאחר החיבור, Eve תיצור ביומן שלך יומן נפרד בשם
          <span dir="ltr" className="mx-1 font-medium text-ink">
            Eve · פגישות
          </span>
          ותכתוב אליו בלבד — היומן הראשי שלך לא ייגע. ניתן לנתק בכל רגע.
        </Note>
      ) : (
        <>
          {connection.lastError && (
            <div className="mb-5 flex items-center gap-2 rounded-md border border-alert-tint bg-alert-tint px-4 py-3 text-[13px] text-alert">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.8} />
              {connection.lastError}
            </div>
          )}

          <Row>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">מחובר לחשבון</div>
              <div dir="ltr" className="truncate text-start text-[13px] text-muted">
                {connection.email || "—"}
              </div>
            </div>
            <a
              href="https://calendar.google.com/"
              target="_blank"
              rel="noreferrer noopener"
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent-tint"
            >
              פתח ב-Google
              <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a>
          </Row>

          <Row>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">פגישות הסטודיו ← Google</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                כל פגישה ביומן הסטודיו נכתבת ליומן
                <span dir="ltr" className="mx-1">
                  {connection.calendarName}
                </span>
                שלך.
              </p>
            </div>
            <Switch
              checked={connection.pushEnabled}
              onChange={(next) => setDirections(next, connection.pullEnabled)}
              label="סנכרון פגישות ליומן Google"
            />
          </Row>

          <Row>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">Google ← זמן תפוס בלוח</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                האירועים מהיומנים שלך יופיעו בלוח הבקרה כזמן תפוס. יומני חגים ויומנים לקריאה בלבד לא
                נכללים.
              </p>
            </div>
            <Switch
              checked={connection.pullEnabled}
              onChange={(next) => setDirections(connection.pushEnabled, next)}
              label="הצגת זמן תפוס מיומן Google"
            />
          </Row>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button size="sm" variant="outline" onClick={syncNow} disabled={pending}>
              <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} strokeWidth={1.8} />
              סנכרן עכשיו
            </Button>
            {syncNote && (
              <span aria-live="polite" className="text-[13px] text-muted">
                {syncNote}
              </span>
            )}
            {!syncNote && connection.lastPushAt && (
              <span className="text-[13px] text-muted">
                סונכרן לאחרונה{" "}
                {new Date(connection.lastPushAt).toLocaleString("he-IL", {
                  day: "numeric",
                  month: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
