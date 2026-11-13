"use client";
// The bell's side sheet (the "Dashboard structure design" board, 2b). It replaced a 320px popover
// that was one flat list with no way to act from it: every row navigated away, and a hall's
// invitation lived elsewhere, as a banner on the dashboard.
//
// Three parts, top to bottom: the filters; "דורש פעולה" — the news the sheet can ANSWER itself
// (a hall's invitation, a client's proposal), pinned; and the feed grouped by event
// (lib/notifications/groups.ts), each group opening its event and each row keeping its deep link.
//
// Which side is reading decides what may appear, never what the server returns (every read here
// guards itself): the pinned section is a STUDIO's alone — a client's bell has nothing of the
// studio's to act on and no link into the studio — and a status chip needs the side's own word
// for an event's state (the studio's stage, the hall's booking status; a client gets none).
import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, CircleCheck, Inbox, PenTool, Sparkles } from "lucide-react";
import { Drawer } from "@/components/drawer";
import { Button } from "@/components/button";
import { segmentClass, segmentFrameClass } from "@/components/segmented";
import { InviteCard, linkCandidates } from "@/app/(app)/dashboard/venue-invites";
import { STATUS_CARD_THEME, type CardTone } from "@/app/(app)/dashboard/dashboard-view-utils";
import { fetchStudioLinks } from "@/lib/event-links/actions";
import type { StudioSideLink } from "@/lib/event-links/types";
import { fetchPendingProposals, type PendingProposal } from "@/lib/proposals/actions";
import { fetchEvents } from "@/lib/events/actions";
import { STATUS_LABEL, STATUS_TONE, eventStatus, formatEventDate, type EventSummary } from "@/lib/events/types";
import { setActiveEventId } from "@/lib/events/storage";
import { fetchBookings, type Booking } from "@/lib/hosting/actions";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, bookingStatus } from "@/lib/hosting/types";
import { useMeetingFlow } from "@/lib/meeting/use-flow";
import type { NotificationFeed } from "@/lib/notifications/actions";
import {
  NOTIFICATION_ICON,
  groupHref,
  groupNotifications,
  notificationsOf,
  timeAgo,
  type NotificationGroup,
  type PendingAction,
} from "@/lib/notifications/groups";
import { notificationText, type AppNotification, type NotificationSide } from "@/lib/notifications/types";

type Filter = "all" | "unread" | "action";

/** What a studio reads when the sheet opens: the two kinds of news it can answer, and its events —
 *  an invitation's link candidates and every group's status. */
interface StudioReads {
  links: StudioSideLink[];
  proposals: PendingProposal[];
  events: EventSummary[];
}

/** A read that fails leaves its part of the sheet empty — the feed itself is already on screen. */
const orEmpty = <T,>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);

const toISODate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function NotificationsSheet({
  feed,
  side,
  onClose,
  onMarkAll,
  onMarkRead,
  onFollow,
}: {
  feed: NotificationFeed;
  /** Null while the bell is still asking who is signed in: the feed shows, nothing side-specific. */
  side: NotificationSide | null;
  onClose: () => void;
  onMarkAll: () => void;
  onMarkRead: (ids: string[]) => void;
  /** A row's own deep link — the bell marks it read and goes. */
  onFollow: (n: AppNotification) => void;
}) {
  const router = useRouter();
  const flow = useMeetingFlow();
  const [filter, setFilter] = useState<Filter>("all");
  const [studio, setStudio] = useState<StudioReads | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  // Bumped after an answer, so the pinned card goes and its event's status is read again.
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    if (side === "studio") {
      void Promise.all([orEmpty(fetchStudioLinks()), orEmpty(fetchPendingProposals()), orEmpty(fetchEvents())]).then(([links, proposals, events]) => {
        if (live) setStudio({ links, proposals, events });
      });
    } else if (side === "venue") {
      void orEmpty(fetchBookings()).then((b) => {
        if (live) setBookings(b);
      });
    }
    return () => {
      live = false;
    };
  }, [side, reads]);

  const now = new Date();
  const today = toISODate(now);
  const items = feed.items;

  // ── the pinned section: a studio's alone ──────────────────────────────────────────────────────
  const invites = side === "studio" && studio ? studio.links.filter((l) => l.state === "pending") : [];
  const proposals = side === "studio" && studio ? studio.proposals : [];
  const candidates = studio ? linkCandidates(studio.links, studio.events) : [];
  const eventsById = new Map((studio?.events ?? []).map((e) => [e.id, e]));
  const said = (action: PendingAction) => notificationsOf(action, items);
  const inviteCards = invites.map((link) => ({ link, rows: said({ kind: "invite", hostName: link.hostName, clientName: link.clientName }) }));
  const proposalCards = proposals.map((p) => ({ p, rows: said({ kind: "proposal", proposalId: p.id }) }));
  const pinned = new Set([...inviteCards, ...proposalCards].flatMap((c) => c.rows.map((n) => n.id)));
  const actionCount = inviteCards.length + proposalCards.length;

  // ── the groups: the feed, less what the pinned cards already say, filtered BEFORE grouping ───
  const shown = filter === "action" ? [] : items.filter((n) => !pinned.has(n.id) && (filter === "all" || !n.readAt));
  const groups = groupNotifications(shown, now);
  const byWhen: { when: NotificationGroup["when"]; groups: NotificationGroup[] }[] = [];
  for (const g of groups) {
    const last = byWhen[byWhen.length - 1];
    if (last?.when === g.when) last.groups.push(g);
    else byWhen.push({ when: g.when, groups: [g] });
  }

  /** The event a group is about, as this side names it and states it. */
  const eventOf = (g: NotificationGroup): { name: string; status?: { label: string; tone: CardTone } } => {
    if (!g.eventId) return { name: g.label };
    if (side === "studio") {
      const e = eventsById.get(g.eventId);
      if (!e) return { name: g.label };
      const s = eventStatus(e, flow);
      return { name: e.clientName || g.label, status: { label: STATUS_LABEL[s], tone: STATUS_TONE[s] } };
    }
    if (side === "venue") {
      const b = bookings?.find((x) => x.event.id === g.eventId);
      if (!b) return { name: g.label };
      const s = bookingStatus(b.event, b.hosting, today);
      return { name: b.event.clientName || g.label, status: { label: BOOKING_STATUS_LABEL[s], tone: BOOKING_STATUS_TONE[s] } };
    }
    return { name: g.label };
  };

  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const answered = (rows: AppNotification[]) => {
    const unread = rows.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length) onMarkRead(unread);
    setReads((n) => n + 1);
  };
  const review = (p: PendingProposal, rows: AppNotification[]) => {
    const unread = rows.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length) onMarkRead(unread);
    // The studio resolves its event from this device's pointer once, when it mounts — so the
    // pointer is set first and the page is loaded whole (the bell's own deep links do the same).
    setActiveEventId(p.eventId);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a whole load, on purpose (above)
    window.location.assign(`/studio?review=${p.id}`);
  };

  const filters: [Filter, string, number | null][] = [
    ["all", "הכל", items.length],
    ["unread", "לא נקראו", feed.unread],
    ...(side === "studio" ? ([["action", "דורש פעולה", studio ? actionCount : null]] as [Filter, string, number | null][]) : []),
  ];
  const showPinned = side === "studio" && actionCount > 0;
  const empty = !showPinned && groups.length === 0;

  return (
    <Drawer
      title="התראות"
      titleAside={
        feed.unread > 0 ? (
          <span className="nums shrink-0 rounded-pill bg-accent-wash px-[9px] py-[3px] text-xs font-bold text-accent-hover">
            {feed.unread === 1 ? "חדשה אחת" : `${feed.unread} חדשות`}
          </span>
        ) : undefined
      }
      actions={
        feed.unread > 0 ? (
          <button
            type="button"
            onClick={onMarkAll}
            className="shrink-0 rounded-pill px-2.5 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:bg-accent-tint"
          >
            סימון הכל כנקרא
          </button>
        ) : undefined
      }
      onClose={onClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
        <div role="group" aria-label="סינון ההתראות" className={segmentFrameClass(true) + " self-start"}>
          {filters.map(([id, label, n]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={segmentClass(filter === id, true)}>
              {label}
              {n !== null && <span className={"nums text-[11px] font-bold " + (filter === id ? "text-accent-deep" : "text-quiet")}>{n}</span>}
            </button>
          ))}
        </div>

        {showPinned && (
          <section className="flex flex-col gap-2">
            <SectionHeading>
              דורש פעולה
              <span className="nums rounded-pill bg-alert-tint px-[7px] py-px text-[11px] font-bold text-alert-ink">{actionCount}</span>
            </SectionHeading>
            {inviteCards.map(({ link, rows }) => (
              <InviteCard
                key={link.id}
                link={link}
                candidates={candidates}
                ago={rows[0] ? timeAgo(rows[0].createdAt, now) : undefined}
                onAnswered={() => answered(rows)}
              />
            ))}
            {proposalCards.map(({ p, rows }) => {
              const e = eventsById.get(p.eventId);
              const actor = rows[0]?.payload.actorName || p.clientName;
              return (
                <div key={p.id} className="flex flex-col gap-3 rounded-md border border-accent-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-accent-tint text-accent">
                      <PenTool className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-snug text-ink">
                        {notificationText({ kind: "proposal.submitted", payload: { actorName: actor, changes: p.changes } }).title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {[p.clientName, e?.date ? formatEventDate(e.date) : "", "ממתין לאישורכם"].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {p.submittedAt && <span className="nums whitespace-nowrap text-xs text-quiet">{timeAgo(p.submittedAt, now)}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => review(p, rows)}>
                      <PenTool className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
                      סקירת השינויים
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => go(`/dashboard?event=${p.eventId}`)}>
                      פתיחת האירוע
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {byWhen.map(({ when, groups: inBucket }) => (
          <section key={when} className="flex flex-col gap-2">
            <SectionHeading>{when}</SectionHeading>
            <div className="flex flex-col gap-3">
              {inBucket.map((g) => {
                const href = groupHref(g);
                const { name, status } = eventOf(g);
                const head = (
                  <>
                    {g.eventId ? (
                      <Sparkles className={"h-3.5 w-3.5 shrink-0 " + (status ? STATUS_CARD_THEME[status.tone].text : "text-quiet")} strokeWidth={2} aria-hidden />
                    ) : (
                      <Inbox className="h-3.5 w-3.5 shrink-0 text-quiet" strokeWidth={2} aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{name}</span>
                    {status && (
                      <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold ${STATUS_CARD_THEME[status.tone].bg} ${STATUS_CARD_THEME[status.tone].text}`}>
                        {status.label}
                      </span>
                    )}
                    {href && <ChevronLeft className="h-4 w-4 shrink-0 text-quiet" strokeWidth={2} aria-hidden />}
                  </>
                );
                return (
                  <div key={g.eventId ?? "general"} className="overflow-hidden rounded-md border border-border bg-surface">
                    {href ? (
                      <button
                        type="button"
                        onClick={() => {
                          // Opening the event is reading what it says about it.
                          const unread = g.items.filter((n) => !n.readAt).map((n) => n.id);
                          if (unread.length) onMarkRead(unread);
                          go(href);
                        }}
                        className="flex w-full items-center gap-2.5 border-b border-border-soft px-4 py-3 text-start transition-colors hover:bg-inset"
                      >
                        {head}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2.5 border-b border-border-soft px-4 py-3">{head}</div>
                    )}
                    {g.items.map((n, i) => {
                      const Icon = NOTIFICATION_ICON[n.kind];
                      const text = notificationText(n);
                      return (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => onFollow(n)}
                          className={
                            "flex w-full items-start gap-2.5 px-4 py-2.5 text-start transition-colors hover:bg-inset " + (i > 0 ? "border-t border-border-soft" : "")
                          }
                        >
                          <span className={"mt-1.5 h-2 w-2 shrink-0 rounded-full " + (n.readAt ? "bg-transparent" : "bg-accent")} aria-hidden />
                          <Icon className="mt-0.5 h-[15px] w-[15px] shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
                          <span className={"min-w-0 flex-1 text-[13px] leading-[1.45] " + (n.readAt ? "text-ink-soft" : "font-semibold text-ink")}>
                            {text.title}
                            {/* The eventless group has no header to say which evening a row is about. */}
                            {!g.eventId && text.detail && <span className="font-normal text-muted"> · {text.detail}</span>}
                          </span>
                          <span className="nums whitespace-nowrap text-xs text-quiet">{timeAgo(n.createdAt, now)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {empty && (
          <div className="flex flex-col items-center px-4 py-8 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface text-accent">
              <CircleCheck className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            </span>
            <p className="text-base font-semibold text-ink">
              {filter === "action" ? "אין מה לאשר כרגע" : filter === "unread" ? "הכל נקרא" : "אין התראות עדיין"}
            </p>
            <p className="mt-1 text-[13px] text-ink-soft">התראות חדשות יופיעו כאן.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return <h3 className="flex min-h-6 items-center gap-2 text-xs font-semibold text-muted">{children}</h3>;
}
