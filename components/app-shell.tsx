"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  LayoutGrid,
  Images,
  PenTool,
  Presentation,
  FileOutput,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { EventSummary } from "@/lib/events/types";
import { activeEvent } from "@/lib/events/storage";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match?: (path: string) => boolean;
}

const GENERAL: NavItem[] = [
  { href: "/dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/halls", label: "אולמות", icon: Building2 },
  { href: "/catalog", label: "קטלוג מוצרים", icon: LayoutGrid },
  { href: "/gallery", label: "גלריה ותצוגות", icon: Images },
];

const TITLES: { test: (p: string) => boolean; title: string; sub?: (e: EventSummary | null) => string }[] = [
  { test: (p) => p.startsWith("/dashboard"), title: "לוח בקרה", sub: () => "סקירת כל האירועים הפעילים" },
  { test: (p) => p.startsWith("/halls"), title: "אולמות", sub: () => "שלדי האולמות שאתם עובדים בהם" },
  { test: (p) => p.startsWith("/catalog"), title: "קטלוג מוצרים", sub: () => "מאגר הפריטים שלך" },
  { test: (p) => p.startsWith("/gallery"), title: "גלריה ותצוגות", sub: () => "תצוגות אצורות מתמונות הפרויקטים" },
  { test: (p) => p.startsWith("/settings"), title: "הגדרות עסק", sub: () => "פרטי עסק, מע״מ ומטבע" },
  { test: (p) => p.startsWith("/studio"), title: "סטודיו עיצוב", sub: (e) => (e ? `${e.clientName} · ${e.hallName}` : "") },
  { test: (p) => p.startsWith("/outputs"), title: "פלטים", sub: (e) => (e ? `${e.clientName} · פלטים תפעוליים` : "") },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const [event, setEvent] = useState<EventSummary | null>(null);

  useEffect(() => {
    setEvent(activeEvent());
  }, [pathname]);

  const meta = TITLES.find((t) => t.test(pathname));

  return (
    <div dir="rtl" className="flex h-dvh w-full overflow-hidden bg-bg">
      {/* Sidebar — quiet gallery: near-white panel, hairline edge, ink text, one muted accent. */}
      <aside className="flex w-64 shrink-0 flex-col border-e border-border bg-surface px-4 py-6">
        <Link href="/dashboard" className="mb-8 block px-2">
          <span className="block font-display text-2xl text-ink">iDesign</span>
          <span className="mt-0.5 block text-[11px] tracking-[0.16em] text-muted">אולפן עיצוב אירועים</span>
        </Link>

        <nav className="flex flex-col gap-0.5">
          {GENERAL.map((item) => (
            <NavRow key={item.href} item={item} pathname={pathname} />
          ))}
          
        </nav>

        <Link
          href="/settings"
          aria-current={pathname.startsWith("/settings") ? "page" : undefined}
          className="mt-auto flex items-center gap-3 rounded-md px-2 py-2 pt-4 transition-colors hover:bg-bg"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg text-sm font-semibold text-ink-soft ring-1 ring-inset ring-border">ד</span>
          <span className="leading-tight">
            <span className="block text-sm font-medium text-ink">דניאל אמסלם</span>
            <span className="block text-xs text-muted">מעצב · חשבון יחיד</span>
          </span>
        </Link>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-surface px-8">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-xl text-ink">{meta?.title ?? "iDesign"}</h1>
            {meta?.sub && <span className="text-sm text-muted">{meta.sub(event)}</span>}
          </div>
          <Link
            href="/meeting?new"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent hover:bg-accent-tint hover:text-ink"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            אירוע חדש — פגישה
          </Link>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={
        "relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors " +
        (active ? "bg-accent-tint font-medium text-ink" : "text-ink-soft hover:bg-bg hover:text-ink")
      }
    >
      {active && <span className="absolute inset-y-2 right-0 w-[3px] rounded-full bg-accent" />}
      <item.icon className={"h-[18px] w-[18px] shrink-0 " + (active ? "text-accent" : "text-muted")} strokeWidth={1.75} />
      {item.label}
    </Link>
  );
}
