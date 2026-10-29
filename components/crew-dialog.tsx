"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { setEventCrew } from "@/lib/production/actions";
import { fetchMembers } from "@/lib/team/actions";
import { STUDIO_ROLE_LABEL, type StudioMember } from "@/lib/team/types";
import { Button } from "@/components/button";
import { Drawer } from "@/components/drawer";

/** Who is on this event's truck. A checklist of the studio's people, saved as a unit.
 *
 *  Shared by the runway row's menu and the event drawer's production section — the one typed fact
 *  of production after the client's yes (lib/production/runway.ts), edited in one place. */
export function CrewDialog({
  eventId,
  clientName,
  crewIds,
  onSaved,
  onClose,
}: {
  eventId: string;
  clientName: string;
  /** Who is on it now. */
  crewIds: readonly string[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<StudioMember[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(crewIds));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchMembers()
      .then((list) => live && setMembers(list.filter((m) => m.status === "active")))
      .catch(() => live && setError("לא ניתן לטעון את אנשי הסטודיו"));
    return () => {
      live = false;
    };
  }, []);

  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setEventCrew(eventId, [...picked]);
      onSaved();
      onClose();
    } catch {
      setError("לא ניתן לשמור את הצוות");
      setBusy(false);
    }
  };

  return (
    <Drawer title={`צוות הקמה — ${clientName}`} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          <p className="text-xs leading-relaxed text-muted">
            מי נוסע לאירוע הזה. אדם שמסומן על שני אירועים שנוגעים זה בזה נקרא בשמו בהתרעת ההתנגשות, ומי
            שבתפקיד צוות רואה במסך ההפקה רק את האירועים שלו.
          </p>
          {error && (
            <p className="rounded-md border border-alert bg-alert-tint px-3 py-2 text-sm text-ink" role="alert">
              {error}
            </p>
          )}
          {!members ? (
            <p className="py-6 text-center text-sm text-muted">טוען…</p>
          ) : members.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">עוד אין אנשים בסטודיו — הזמינו אותם בהגדרות.</p>
          ) : (
            <ul className="flex flex-col gap-1" role="group" aria-label="אנשי הצוות">
              {members.map((m) => {
                const on = picked.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(m.id)}
                      className={
                        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-start transition-colors " +
                        (on ? "border-accent bg-accent-tint" : "border-border bg-canvas hover:border-accent-line")
                      }
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? "bg-accent text-canvas" : "border border-border bg-canvas"}`}
                      >
                        {on && <Check className="h-3 w-3" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={"block truncate text-sm " + (on ? "font-bold text-accent" : "font-semibold text-ink")}>{m.name}</span>
                        <span className="block text-xs text-muted">{STUDIO_ROLE_LABEL[m.role]}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            ביטול
          </Button>
          <Button onClick={() => void save()} disabled={busy || !members}>
            {busy ? "שומרים…" : "שמירת הצוות"}
          </Button>
        </div>
      </div>
    </Drawer>
  );
}
