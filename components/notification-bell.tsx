"use client";
// The bell — the studio's top bar and the client's header, one component over one feed
// (lib/notifications/). It reads on mount, when the window regains focus, every minute while the
// tab is visible, and when opened. No push: there is no socket in this app, and a minute is soon
// enough for "your client sent changes".
import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Popover } from "@/components/popover";
import { Button } from "@/components/button";
import { fetchNotifications, markNotificationsRead, type NotificationFeed } from "@/lib/notifications/actions";
import { notificationHref, notificationText, type AppNotification } from "@/lib/notifications/types";
import { setActiveEventId } from "@/lib/events/storage";

const POLL_MS = 60_000;

/** "עכשיו", "לפני 5 דק׳", "לפני 3 שע׳", then the date. */
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "עכשיו";
  if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`;
  if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`;
  return new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

export function NotificationBell() {
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const load = useCallback(async () => {
    try {
      setFeed(await fetchNotifications());
    } catch {
      // A bell that cannot be read stays as it was — it is not worth an error on every page.
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetchNotifications()
      .then((f) => {
        if (live) setFeed(f);
      })
      .catch(() => {});
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => {
      live = false;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(t);
    };
  }, [load]);

  const follow = (n: AppNotification) => {
    void markNotificationsRead([n.id]);
    // A studio notification about an event opens THAT event: the studio resolves which event is
    // open from this device's pointer (lib/events/storage.ts), once, when it mounts — so the pointer
    // is set first and the page is loaded whole rather than navigated within.
    if (n.eventId && n.kind !== "proposal.resolved" && n.kind !== "event.shared") setActiveEventId(n.eventId);
    window.location.assign(notificationHref(n));
  };

  const markAll = async () => {
    await markNotificationsRead();
    await load();
  };

  return (
    <Popover trigger="icon" icon={Bell} label="התראות" badge={feed.unread} side="bottom" panelClassName="w-80" onOpenChange={(open) => open && void load()}>
      {(close) =>
        feed.items.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-muted">אין התראות עדיין. כשמשהו יקרה באירוע — לקוח שהצטרף, שינויים בסקיצה — זה יופיע כאן.</p>
        ) : (
          <>
            <ul className="-mx-2 -my-1 flex flex-col">
              {feed.items.map((n) => {
                const text = notificationText(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        follow(n);
                      }}
                      className="flex w-full items-start gap-2.5 rounded-sm px-2 py-2 text-start transition-colors hover:bg-accent-tint"
                    >
                      <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className={"block text-[13px] leading-snug " + (n.readAt ? "text-ink-soft" : "font-semibold text-ink")}>{text.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {text.detail ? `${text.detail} · ` : ""}
                          {ago(n.createdAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {feed.unread > 0 && (
              <Button variant="outline" size="sm" onClick={() => void markAll()} className="mt-3 w-full">
                סימון הכל כנקרא
              </Button>
            )}
          </>
        )
      }
    </Popover>
  );
}
