"use client";

import { useEffect, useState } from "react";
import { Database, ListChecks, Share2, Store, UserRound, Users } from "lucide-react";
import { BusinessSection } from "./business-section";
import { AccountSection } from "./account-section";
import { MeetingSection } from "./meeting-section";
import { TeamSection } from "./team-section";
import { SharingSection } from "./sharing-section";
import { DataSection } from "./data-section";

// Settings, in six sections along the axis each one belongs to:
//
//   העסק / החשבון שלי  — the studio and the person, one letterhead and one profile.
//   מצב פגישה          — the shape of a client meeting (lib/meeting/steps.ts).
//   צוות והרשאות       — who works in this business (lib/team/storage.ts).
//   מתחמים ושיתוף      — who may open a property (lib/venues/access.ts).
//   נתונים             — the backup, while the store is still this browser.
//
// The two people sections are separate on purpose: a studio member and a venue guest are not two
// weights of the same thing. One is inside the business and sees its work; the other is another
// designer standing in a hall you drew, and sees the property alone.
const SECTIONS = [
  { id: "business", label: "העסק", icon: Store },
  { id: "account", label: "החשבון שלי", icon: UserRound },
  { id: "meeting", label: "מצב פגישה", icon: ListChecks },
  { id: "team", label: "צוות והרשאות", icon: Users },
  { id: "sharing", label: "מתחמים ושיתוף", icon: Share2 },
  { id: "data", label: "נתונים", icon: Database },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsScreen() {
  const [section, setSection] = useState<SectionId>("business");

  // The section lives in the hash rather than in a query param: it makes /settings#sharing
  // linkable from the venue plan editor without pulling this client screen into the
  // useSearchParams / Suspense dance for one string.
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (SECTIONS.some((s) => s.id === fromHash)) setSection(fromHash as SectionId);
  }, []);

  const go = (id: SectionId) => {
    setSection(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      // non-fatal: the section still switched
    }
  };

  return (
    <div className="flex items-start gap-3 px-8 py-8">
      <nav aria-label="הגדרות" className="sticky top-0 flex w-[228px] shrink-0 flex-col gap-[3px] rounded-md border border-border bg-surface p-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = id === section;
          return (
            <button
              key={id}
              type="button"
              onClick={() => go(id)}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-3 rounded-md px-3.5 py-[11px] text-sm transition-colors " +
                (active ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:bg-accent-tint hover:text-accent")
              }
            >
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.4} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {section === "business" && <BusinessSection />}
        {section === "account" && <AccountSection />}
        {section === "meeting" && <MeetingSection />}
        {section === "team" && <TeamSection />}
        {section === "sharing" && <SharingSection />}
        {section === "data" && <DataSection />}
      </div>
    </div>
  );
}
