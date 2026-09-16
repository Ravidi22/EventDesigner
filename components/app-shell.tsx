"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarClock,
  Building2,
  LayoutGrid,
  Images,
  Truck,
  Bell,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { setActiveVenueId } from "@/lib/venues/storage";
import { useVenues } from "@/lib/venues/use-venues";
import { Wordmark } from "@/components/wordmark";
import { VenueSwitcher } from "@/components/venue-switcher";
import { IconButton } from "@/components/icon-button";
import { HeaderSearchProvider } from "@/components/header-search-context";
import { EventDialog } from "@/components/event-dialog";
import { SidePanel } from "@/components/side-panel";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

const GENERAL: NavItem[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  // הפקה, not אירועים: the screen behind it is a backward-planned deadline list, not a filing
  // cabinet of events — and CalendarClock rather than CalendarHeart for the same reason. A heart on
  // a wedding app reads as "the nice part"; what this tab actually says is "how long do I have".
  { href: "/production", label: "הפקה", icon: CalendarClock },
  { href: "/halls", label: "תוכנית המתחם", icon: Building2 },
  { href: "/catalog", label: "קטלוג מוצרים", icon: LayoutGrid },
  { href: "/suppliers", label: "ספקים ורכש", icon: Truck },
  { href: "/gallery", label: "גלריה ומצגות", icon: Images },
];

const TITLES: { test: (p: string) => boolean; title: string }[] = [
  { test: (p) => p.startsWith("/dashboard"), title: "לוח בקרה" },
  { test: (p) => p.startsWith("/production"), title: "הפקה" },
  { test: (p) => p.startsWith("/halls"), title: "תוכנית המתחם" },
  { test: (p) => p.startsWith("/catalog"), title: "קטלוג מוצרים" },
  { test: (p) => p.startsWith("/suppliers"), title: "ספקים ורכש" },
  { test: (p) => p.startsWith("/gallery"), title: "גלריה ומצגות" },
  { test: (p) => p.startsWith("/settings"), title: "הגדרות" },
  { test: (p) => p.startsWith("/studio"), title: "סטודיו עיצוב" },
  { test: (p) => p.startsWith("/outputs"), title: "פלטים" },
];

/** Who is signed in. Handed down from the (app) layout, which has already resolved the session
 *  server-side — the shell does not re-fetch it, and cannot be rendered without one. */
export interface ShellUser {
  name: string | null;
  email: string;
}

export function AppShell({ children, user }: { children: ReactNode; user: ShellUser }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [creating, setCreating] = useState(false);
  // Venues come from the (app) layout's server-side read, through VenuesProvider — the switcher does
  // not fetch them, and neither does anything else that needs them. The selection itself still lives
  // in this browser; the provider resolves it against the list and publishes one answer.
  //
  // There is no local `selected` mirror here any more. It was a second copy of a fact the provider
  // already holds, and the two could disagree: clicking a venue set `selected`, but a venue deleted
  // in another tab left it pointing at a row no longer in the list, which the provider's own
  // fallback would have corrected. Writing through setActiveVenueId fires VENUE_CHANGED_EVENT and
  // the provider re-resolves, so the switcher stays live without holding state of its own. `remove`
  // needs no such override either — deleting a venue updates the provider's own list, and its
  // activeVenueId falls back on its own once the deleted id is no longer in it.
  const { venues, activeVenueId, add, rename, remove } = useVenues();

  // The header search means something different per page (products on /catalog, clients/events
  // elsewhere) — leaving stale text behind after navigating away would silently mis-filter
  // whatever page you land on next.
  useEffect(() => {
    setHeaderSearch("");
  }, [pathname]);

  const meta = TITLES.find((t) => t.test(pathname));
  const settingsActive = pathname.startsWith("/settings");
  const isCatalog = pathname.startsWith("/catalog");
  // The "new event" CTA and the notification bell are dashboard/events actions — everywhere else
  // (the venue plan, the catalog, the gallery, settings…) they're chrome with nothing to act on.
  const showHeaderActions = pathname.startsWith("/dashboard") || pathname.startsWith("/production");

  // Someone who signed up without giving a name still needs something to see themselves as, and the
  // local part of their own email is the thing they will recognise.
  const displayName = user.name?.trim() || user.email.split("@")[0];
  // Hebrew, Latin or otherwise — the first character of whatever they are called. Not initials from
  // two words: plenty of people have one.
  const initial = displayName.slice(0, 1).toUpperCase();

  const leave = async () => {
    setLeaving(true);
    await signOut();
    // replace, not push: the studio must not be one Back button away from a signed-out browser.
    router.replace("/login");
    router.refresh();
  };

  return (
    <div dir="rtl" className="flex h-dvh w-full gap-3 overflow-hidden bg-bg p-3 print:block print:h-auto print:overflow-visible print:p-0">
      {/* Sidebar — a floating card on the bg plane: subtle rounded corners, a soft lift, ink
          text, one muted accent. Internal panels (nav, profile, venue switcher) use a smaller
          radius than this outer card so the nesting reads as proportional, not arbitrary.
          The shell, its collapse puck and the width transition are SidePanel's
          (components/side-panel.tsx) — the venue plan's zone panel is built from the same one, so
          the two collapse identically instead of by two hand-rolled copies that drift apart. No
          `rail` here: these rows collapse to their own icons rather than being stood in for. */}
      <SidePanel
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        label="סרגל הצד"
        className="no-print shrink-0 rounded-md bg-surface py-6 shadow-floating"
        expandedClassName="w-[258px] px-4"
        collapsedClassName="w-[96px] px-2"
      >
        <Link
          href="/dashboard"
          aria-label="Eve — לוח בקרה"
          className={
            "mb-[26px] flex flex-col items-center overflow-hidden " + (collapsed ? "px-1 py-3" : "px-2 py-5")
          }
        >
          <Wordmark
            tone={collapsed ? "gradient" : "solid"}
            className={"transition-[font-size] duration-200 " + (collapsed ? "text-[30px]" : "text-[28px]")}
          />
          {!collapsed && (
            <span dir="ltr" className="font-label mt-1 text-[10px] font-medium tracking-[3px] text-[#b6b2c4]">
              EVENT STUDIO
            </span>
          )}
        </Link>

        <VenueSwitcher
          venues={venues}
          activeId={activeVenueId}
          collapsed={collapsed}
          onSelect={(id) => setActiveVenueId(id)}
          onAdd={() => {
            void add().then(() => {
              // A venue with nothing drawn on it isn't a real state — send the designer straight
              // into drawing its first room.
              router.push("/halls");
            });
          }}
          onRename={(id, name) => void rename(id, name)}
          onDelete={(id) => remove(id)}
        />

        <nav className="flex flex-col gap-[3px]">
          {GENERAL.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>

        {/* The profile card. Its geometry is pinned by the design spec (14px radius, p-[11px],
            gap-[11px], border hairline on bg-inset) — what changed is that it is now a CONTAINER
            holding two controls rather than one link, because a button cannot legally nest inside
            an anchor and sign-out has to be reachable from every screen. Every pinned number is
            carried by the container, so the box is the same box. */}
        <div
          className={
            "mt-auto flex items-center rounded-md border border-border bg-inset transition-colors hover:bg-accent-tint " +
            (collapsed ? "flex-col gap-2 px-0 py-[11px]" : "gap-[11px] p-[11px]")
          }
        >
          <Link
            href="/settings"
            aria-current={settingsActive ? "page" : undefined}
            title={collapsed ? `הגדרות · ${displayName}` : undefined}
            className={
              "flex min-w-0 items-center gap-[11px] " +
              (collapsed ? "justify-center" : "flex-1") +
              " " +
              (settingsActive ? "font-bold text-accent" : "")
            }
          >
            <span className="grad-cta flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-canvas">
              {initial}
            </span>
            {!collapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[14px] font-semibold leading-[1.25] text-ink">
                  {displayName}
                </span>
                {/* The email, not a role label: it is what tells you WHICH account this browser is
                    signed into, which is the question a profile card in a multi-tenant app is
                    actually being asked. */}
                <span className="block truncate text-xs text-quiet" dir="ltr">
                  {user.email}
                </span>
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={leave}
            disabled={leaving}
            title="יציאה מהחשבון"
            aria-label="יציאה מהחשבון"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.4} />
          </button>
        </div>
      </SidePanel>

      {/* Main. `no-print` on the sidebar and this header, and `print:` on the boxes between them
          and the screen: the shell is a viewport-fixed flex box (h-dvh + overflow-hidden, a
          scrolling <main>), and a printed page has no viewport — an overflow ancestor clips the
          document to whatever one page happened to show, so a three-sheet plan set printed one
          sheet with a sidebar down its edge. Every output already marks its own chrome no-print
          (outputs-screen, event-surface, quote-sheet); the shell around them never did. */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 print:block">
        <header className="no-print flex h-16 shrink-0 items-center gap-4 rounded-md bg-surface px-8 shadow-floating">
          {meta ? (
            <h1 className="shrink-0 font-display text-h2 text-ink">{meta.title}</h1>
          ) : (
            <Wordmark tone="mono" className="shrink-0 text-[22px]" />
          )}

          {/* No visible search box or icon here anymore — the catalog's own search box lives in
              its control bar instead (app/(app)/catalog/filters.tsx), still fed by the same
              shared value (HeaderSearchProvider) so this spacer keeps the header's own layout. */}
          <div className="flex-1" />

          {showHeaderActions && (
            <div className="flex shrink-0 items-center gap-1.5">
              {/* Opens the details form in place rather than navigating to /meeting?new: answering
                  six questions is not worth losing the screen you were on. The dialog walks into
                  the meeting itself once the event exists — see components/event-dialog.tsx. */}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="inline-flex items-center rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-canvas shadow-cta transition-colors hover:bg-accent-hover"
              >
                + יצירת אירוע חדש
              </button>
              <IconButton label="התראות">
                <Bell className="h-4 w-4" strokeWidth={1.75} />
              </IconButton>
            </div>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-auto print:block print:overflow-visible">
          <HeaderSearchProvider value={{ value: headerSearch, setValue: setHeaderSearch }}>{children}</HeaderSearchProvider>
        </main>

        {/* Mounted at the shell, so "אירוע חדש" is reachable from every page without each of them
            carrying its own copy. A <dialog> renders in the top layer — where it sits in the tree
            has no bearing on where it appears. */}
        <EventDialog open={creating} onClose={() => setCreating(false)} />
      </div>
    </div>
  );
}

function NavRow({ item, pathname, collapsed }: { item: NavItem; pathname: string; collapsed: boolean }) {
  const active = item.match
    ? item.match(pathname)
    : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={
        "relative flex items-center gap-3 rounded-md py-[11px] text-sm transition-colors " +
        (collapsed ? "justify-center px-0" : "px-3.5") +
        " " +
        (active
          ? "bg-accent-tint font-bold text-accent"
          : "font-semibold text-muted hover:bg-accent-tint hover:text-accent-hover")
      }
    >
      <item.icon
        className={
          "h-[18px] w-[18px] shrink-0 " +
          (active ? "text-accent" : "text-muted")
        }
        strokeWidth={1.4}
      />
      {!collapsed && item.label}
    </Link>
  );
}
