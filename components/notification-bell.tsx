"use client";
// The bell — the studio's top bar and the client's header, one component over one feed
// (lib/notifications/). It reads on mount, when the window regains focus, every minute while the
// tab is visible, and when opened. No push: there is no socket in this app, and a minute is soon
// enough for "your client sent changes".
//
// Pressed, it opens the side sheet (components/notifications-sheet.tsx), which needs to know WHOSE
// bell it is — a studio may act from it, a client may not. A caller that knows says so through
// `side`. One that does not is answered here: a page under /client is a client's, and anywhere else
// the session is asked once, after the first feed — the shell's header sits outside the
// organisation-kind context (components/org-kind-context.tsx is provided around <main> only), so
// the context cannot tell a hall from a studio there.
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { NotificationsSheet } from "@/components/notifications-sheet";
import { currentUser } from "@/lib/auth/actions";
import { fetchNotifications, markNotificationsRead, type NotificationFeed } from "@/lib/notifications/actions";
import { KIND_SIDE, notificationHref, type AppNotification, type NotificationSide } from "@/lib/notifications/types";
import { setActiveEventId } from "@/lib/events/storage";

const POLL_MS = 60_000;

export function NotificationBell({ side: given }: { side?: NotificationSide } = {}) {
  const onClientPage = (usePathname() ?? "").startsWith("/client");
  const [feed, setFeed] = useState<NotificationFeed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState<NotificationSide | null>(null);
  const side = given ?? (onClientPage ? "client" : asked);
  const mustAsk = !given && !onClientPage;

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
      .catch(() => {})
      // After the feed, so the badge is never queued behind it (server actions go one at a time).
      // A supplier has no bell in the shell; a business that has not named its kind yet reads as a
      // studio, whose every read guards itself.
      .then(() => (mustAsk ? currentUser() : null))
      .then((s) => {
        if (live && s) setAsked(s.kind === "client" ? "client" : s.organizationKind === "venue" ? "venue" : "studio");
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
  }, [load, mustAsk]);

  const follow = (n: AppNotification) => {
    void markNotificationsRead([n.id]);
    setOpen(false);
    // A studio notification about an event opens THAT event: the studio resolves which event is
    // open from this device's pointer (lib/events/storage.ts), once, when it mounts — so the pointer
    // is set first and the page is loaded whole rather than navigated within.
    if (n.eventId && KIND_SIDE[n.kind] === "studio") setActiveEventId(n.eventId);
    window.location.assign(notificationHref(n));
  };

  /** Read at once on screen, then on the server, then the feed again (another tab may have read more). */
  const markRead = async (ids?: string[]) => {
    const stamp = new Date().toISOString();
    setFeed((f) => {
      const hits = f.items.filter((n) => !n.readAt && (!ids || ids.includes(n.id))).length;
      return {
        items: f.items.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: stamp } : n)),
        unread: ids ? Math.max(0, f.unread - hits) : 0,
      };
    });
    try {
      await markNotificationsRead(ids);
    } finally {
      await load();
    }
  };

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={feed.unread > 0 ? `התראות, ${feed.unread} חדשות` : "התראות"}
        title="התראות"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className={
          "relative rounded-pill p-2 transition-colors " +
          // Tinted while its sheet is open, the way a pressed toolbar button is.
          (open ? "bg-accent-tint text-accent hover:bg-accent-wash" : "text-muted hover:bg-accent-tint hover:text-accent-hover")
        }
      >
        <Bell className="h-4 w-4" strokeWidth={2} aria-hidden />
        {feed.unread > 0 && (
          <span className="nums absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-pill bg-alert px-1 text-[10px] font-bold leading-none text-canvas">
            {feed.unread > 99 ? "99+" : feed.unread}
          </span>
        )}
      </button>
      {open && (
        <NotificationsSheet
          feed={feed}
          side={side}
          onClose={() => setOpen(false)}
          onMarkAll={() => void markRead()}
          onMarkRead={(ids) => void markRead(ids)}
          onFollow={follow}
        />
      )}
    </>
  );
}
