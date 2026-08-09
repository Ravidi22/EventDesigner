"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  CalendarHeart,
  Building2,
  LayoutGrid,
  Images,
  ChevronsLeft,
  Bell,
  type LucideIcon,
} from "lucide-react";
import { setActiveVenueId } from "@/lib/venues/storage";
import { useVenues } from "@/lib/venues/use-venues";
import { Wordmark } from "@/components/wordmark";
import { VenueSwitcher } from "@/components/venue-switcher";
import { IconButton } from "@/components/icon-button";
import { HeaderSearchProvider } from "@/components/header-search-context";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

const GENERAL: NavItem[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/gantt", label: "אירועים", icon: CalendarHeart },
  { href: "/halls", label: "תוכנית המתחם", icon: Building2 },
  { href: "/catalog", label: "קטלוג מוצרים", icon: LayoutGrid },
  { href: "/gallery", label: "גלריה ותצוגות", icon: Images },
];

const TITLES: { test: (p: string) => boolean; title: string }[] = [
  { test: (p) => p.startsWith("/dashboard"), title: "לוח בקרה" },
  { test: (p) => p.startsWith("/gantt"), title: "אירועים" },
  { test: (p) => p.startsWith("/halls"), title: "תוכנית המתחם" },
  { test: (p) => p.startsWith("/catalog"), title: "קטלוג מוצרים" },
  { test: (p) => p.startsWith("/gallery"), title: "גלריה ותצוגות" },
  { test: (p) => p.startsWith("/settings"), title: "הגדרות" },
  { test: (p) => p.startsWith("/studio"), title: "סטודיו עיצוב" },
  { test: (p) => p.startsWith("/outputs"), title: "פלטים" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  // Venues come from the server now; the switcher's own selection stays in this browser.
  const { venues, activeVenueId, add, rename } = useVenues();
  const [selected, setSelected] = useState<string | null>(null);
  const current = selected ?? activeVenueId;

  // The header search means something different per page (products on /catalog, clients/events
  // elsewhere) — leaving stale text behind after navigating away would silently mis-filter
  // whatever page you land on next.
  useEffect(() => {
    setHeaderSearch("");
  }, [pathname]);

  const meta = TITLES.find((t) => t.test(pathname));
  const settingsActive = pathname.startsWith("/settings");
  const isCatalog = pathname.startsWith("/catalog");

  return (
    <div dir="rtl" className="flex h-dvh w-full gap-3 overflow-hidden bg-bg p-3">
      {/* Sidebar — a floating card on the bg plane: subtle rounded corners, a soft lift, ink
          text, one muted accent. Internal panels (nav, profile, venue switcher) use a smaller
          radius than this outer card so the nesting reads as proportional, not arbitrary. */}
      <aside
        className={
          "group/sidebar relative flex shrink-0 flex-col rounded-md bg-surface py-6 shadow-floating transition-[width] duration-200 ease-fluid " +
          (collapsed ? "w-[96px] px-2" : "w-[258px] px-4")
        }
      >
        {/* Collapse toggle — a "liquid glass" puck straddling the sidebar's trailing edge,
            vertically centered so it never sits over the venue switcher or nav rows. Subtly
            visible at rest (not opacity-0) so it's always there to find and click — a hover-only
            reveal meant clicks could miss it whenever the hover state wasn't active at that exact
            moment (no persistent hover on touch/trackpad), which read as "the button doesn't work". */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "הרחב סרגל צד" : "כווץ סרגל צד"}
          style={{ insetInlineEnd: "-14px" }}
          className="absolute top-1/2 z-30 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-white/50 text-ink-soft opacity-40 shadow-floating backdrop-blur-md transition-all duration-150 hover:opacity-100 hover:bg-white/80 hover:text-accent focus-visible:opacity-100 group-hover/sidebar:opacity-100"
        >
          <ChevronsLeft className={"h-4 w-4 transition-transform duration-200 " + (collapsed ? "rotate-180" : "")} strokeWidth={2} />
        </button>

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
          activeId={current}
          collapsed={collapsed}
          onSelect={(id) => {
            setSelected(id);
            setActiveVenueId(id);
          }}
          onAdd={() => {
            void add().then(() => {
              // A venue with nothing drawn on it isn't a real state — send the designer straight
              // into drawing its first room.
              router.push("/halls");
            });
          }}
          onRename={(id, name) => void rename(id, name)}
        />

        <nav className="flex flex-col gap-[3px]">
          {GENERAL.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
          ))}
        </nav>

        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          title={collapsed ? "הגדרות · דניאל אמסלם" : undefined}
          className={
            "mt-auto flex items-center gap-[11px] rounded-md border border-border bg-inset transition-colors hover:bg-accent-tint " +
            (collapsed ? "justify-center px-0 py-[11px]" : "p-[11px]") +
            " " +
            (settingsActive ? "font-bold text-accent" : "")
          }
        >
          <span className="grad-cta flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-canvas">
            ד
          </span>
          {!collapsed && (
            <span className="leading-tight">
              <span className="block text-[14px] font-semibold leading-[1.25] text-ink">דניאל אמסלם</span>
              <span className="block text-xs text-quiet">מעצב · חשבון יחיד</span>
            </span>
          )}
        </Link>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <header className="flex h-16 shrink-0 items-center gap-4 rounded-md bg-surface px-8 shadow-floating">
          {meta ? (
            <h1 className="shrink-0 font-display text-h2 text-ink">{meta.title}</h1>
          ) : (
            <Wordmark tone="mono" className="shrink-0 text-[22px]" />
          )}

          {/* No visible search box or icon here anymore — the catalog's own search box lives in
              its control bar instead (app/(app)/catalog/filters.tsx), still fed by the same
              shared value (HeaderSearchProvider) so this spacer keeps the header's own layout. */}
          <div className="flex-1" />

          <div className="flex shrink-0 items-center gap-1.5">
            <Link
              href="/meeting?new"
              className="inline-flex items-center rounded-pill bg-accent px-5 py-2.5 text-sm font-bold text-canvas shadow-cta transition-colors hover:bg-accent-hover"
            >
              + יצירת אירוע חדש
            </Link>
            <IconButton label="התראות">
              <Bell className="h-4 w-4" strokeWidth={1.75} />
            </IconButton>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <HeaderSearchProvider value={{ value: headerSearch, setValue: setHeaderSearch }}>{children}</HeaderSearchProvider>
        </main>
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
