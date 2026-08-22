"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, LogOut, MapPin, Users } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { signOut } from "@/lib/auth/actions";
import { formatEventDate } from "@/lib/events/types";
import type { ClientEvent } from "@/lib/client-portal/actions";

// The client's home. One screen, no sidebar, no navigation — there is one thing here and it is
// their own event.
//
// THE EMPTY STATE IS THE HONEST ONE. Sharing an event with a client is a deliberate act by the
// designer (a row in event_clients) and nothing in the studio creates one yet. So an account with
// no shared event says exactly that, rather than showing a skeleton of a plan that is coming. A
// mocked-up preview here would be the one lie the client actually acts on.
export function ClientHome({
  name,
  email,
  events,
}: {
  name: string | null;
  email: string;
  events: ClientEvent[];
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  const leave = async () => {
    setLeaving(true);
    await signOut();
    router.replace("/login");
    router.refresh();
  };

  return (
    <div dir="rtl" className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-6">
        <Wordmark tone="mono" className="text-[22px]" />
        <span className="ms-auto min-w-0 leading-tight text-end">
          <span className="block truncate text-sm font-semibold text-ink">{name || "החשבון שלי"}</span>
          <span className="block truncate text-xs text-quiet" dir="ltr">
            {email}
          </span>
        </span>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          aria-label="יציאה מהחשבון"
          title="יציאה מהחשבון"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-bg hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
        >
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.4} />
        </button>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {events.length === 0 ? <NothingShared /> : <EventList events={events} />}
      </main>
    </div>
  );
}

function NothingShared() {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="font-display text-h2 text-ink text-balance">החשבון שלכם מוכן</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-soft">
        עדיין לא שותף איתכם אירוע. כשהמעצב ישתף את האירוע שלכם, הוא יופיע כאן — עם התאריך, המתחם
        והסקיצה שהוכנה עבורכם.
      </p>
      <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed text-muted">
        אם כבר יש לכם אירוע בתכנון, בקשו מהמעצב לשתף אותו עם כתובת האימייל שאיתה נרשמתם.
      </p>
    </div>
  );
}

function EventList({ events }: { events: ClientEvent[] }) {
  return (
    <>
      <h1 className="font-display text-h1 text-ink text-balance">האירוע שלכם</h1>
      <div className="mt-6 flex flex-col gap-4">
        {events.map((e) => (
          <article key={e.id} className="rounded-lg border border-border bg-surface p-6">
            <p className="font-label text-[10px] font-medium uppercase tracking-[3px] text-quiet" dir="ltr">
              {e.studioName}
            </p>
            <h2 className="mt-2 font-display text-h2 text-ink">
              {e.venueName ?? "המתחם טרם נבחר"}
            </h2>
            <dl className="mt-4 flex flex-col gap-2.5 text-sm text-ink-soft">
              <Row icon={CalendarDays} label="תאריך">
                {formatEventDate(e.date)}
                {e.time ? ` · ${e.time}` : ""}
              </Row>
              {e.where && (
                <Row icon={MapPin} label="איפה">
                  {e.where}
                </Row>
              )}
              {e.guests > 0 && (
                <Row icon={Users} label="אורחים">
                  <span className="nums">{e.guests}</span>
                </Row>
              )}
            </dl>
            {/* No sketch yet: showing the plan is the next piece of work, and a card that promised
                one before it exists would be the same lie as a fake empty state. */}
            <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted">
              הסקיצה של האירוע תופיע כאן ברגע שהמעצב ישתף אותה.
            </p>
          </article>
        ))}
      </div>
    </>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icon className="h-[18px] w-[18px] shrink-0 text-muted" strokeWidth={1.4} />
      <dt className="sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
