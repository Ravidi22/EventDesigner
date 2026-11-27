"use client";

import { useState } from "react";
import { useIsSupplier, useIsVenue } from "@/components/org-kind-context";
import { useMounted } from "@/lib/use-mounted";
import { CalendarClock, CalendarSync, DoorClosed, Download, Grid2x2, ListChecks, Palette, ReceiptText, ScrollText, Share2, Store, UserRound, Users } from "lucide-react";
import type { BusinessSettings } from "@/lib/settings/types";
import type { CheckpointOffsets } from "@/lib/production/runway";
import type { GoogleStatus } from "@/lib/google/actions";
import type { StudioMember } from "@/lib/team/types";
import { PAGE_GUTTER } from "@/components/page-gutter";
import { BusinessSection } from "./business-section";
import { BillingSection } from "./billing-section";
import { BrandingSection } from "./branding-section";
import type { SeriesCounter } from "@/lib/billing/actions";
import { AccountSection } from "./account-section";
import { MeetingSection } from "./meeting-section";
import { CheckpointsSection } from "./checkpoints-section";
import { StagesSection } from "./stages-section";
import type { StageRules } from "@/lib/settings/actions";
import { TeamSection } from "./team-section";
import { SharingSection } from "./sharing-section";
import { CalendarSection } from "./calendar-section";
import { ExportSection } from "./export-section";
import { AuditSection } from "./audit-section";
import { CloseSection } from "./close-section";
import { useAccountExport } from "@/components/account-export";

// Settings, in six sections along the axis each one belongs to:
//
//   העסק / החשבון שלי  — the studio and the person, one letterhead and one profile.
//   מצב פגישה          — the shape of a client meeting (lib/meeting/steps.ts).
//   לוח זמנים להפקה     — when each production checkpoint is due (lib/production/runway.ts).
//   במות               — the stage rules the studio checks against (railings; lib/design-document/stage.ts).
//   צוות והרשאות       — who works in this business (lib/team/types.ts).
//   מתחמים ושיתוף      — who may open a property (lib/venues/access.ts).
//   ייצוא נתונים / יומן פעולות / סגירת העסק — the owner's: the whole business in a zip, who did
//                        what, and the way out (lib/account/, lib/audit/; EVE-22/51/52).
//
// The two people sections are separate on purpose: a studio member and a venue guest are not two
// weights of the same thing. One is inside the business and sees its work; the other is another
// designer standing in a hall you drew, and sees the property alone.
const SECTIONS = [
  { id: "business", label: "העסק", icon: Store },
  // Straight after the business: what the billing documents read off it (lib/billing).
  { id: "billing", label: "חיוב ומסמכים", icon: ReceiptText },
  // How the quote and the crew sheets look (the Documents board, 2026-11-10).
  { id: "branding", label: "מיתוג מסמכים", icon: Palette },
  { id: "account", label: "החשבון שלי", icon: UserRound },
  { id: "meeting", label: "מצב פגישה", icon: ListChecks },
  // Straight after the meeting, and sharing the nav tab's own icon so the row says which screen it
  // configures: the meeting is what produces an event, and this is the clock that starts running on
  // it the moment it has a date.
  { id: "checkpoints", label: "לוח זמנים להפקה", icon: CalendarClock },
  { id: "stages", label: "במות", icon: Grid2x2 },
  { id: "team", label: "צוות והרשאות", icon: Users },
  { id: "sharing", label: "מתחמים ושיתוף", icon: Share2 },
  { id: "calendar", label: "יומן Google", icon: CalendarSync },
  { id: "export", label: "ייצוא נתונים", icon: Download },
  { id: "audit", label: "יומן פעולות", icon: ScrollText },
  { id: "close", label: "סגירת העסק", icon: DoorClosed },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** A designer's own machinery — the meeting flow, the production clock, the stage rules. A venue
 *  runs none of them, so its settings leave them out. */
const DESIGNER_ONLY: ReadonlySet<SectionId> = new Set<SectionId>(["meeting", "checkpoints", "stages", "branding"]);

/** The business as a whole — its data, its log, closing it. The owner's alone (the actions refuse
 *  anyone else too). */
const OWNER_ONLY: ReadonlySet<SectionId> = new Set<SectionId>(["export", "audit", "close"]);

// The shared reads arrive from page.tsx and are handed to whichever section is open. Sections mount
// one at a time (only the selected one renders below), so seeding them here is also what makes
// SWITCHING sections instant — each used to fetch its own data on mount, every time you clicked it.
export function SettingsScreen({
  initialSettings,
  initialMe,
  initialMembers,
  initialGoogle,
  initialOffsets,
  initialStageRules,
  initialCounters,
  emailEnabled,
  needsPassword,
}: {
  initialSettings: BusinessSettings;
  initialCounters: SeriesCounter[];
  initialMe: StudioMember | null;
  initialMembers: StudioMember[];
  initialGoogle: GoogleStatus;
  initialOffsets: CheckpointOffsets;
  initialStageRules: StageRules;
  /** Whether this deployment can send mail — the team section offers "send by email" only then. */
  emailEnabled: boolean;
  /** The signed-in person signs in with a password — the delete question asks for it. */
  needsPassword: boolean;
}) {
  // The section lives in the hash rather than in a query param: it makes /settings#sharing
  // linkable from the venue plan editor without pulling this client screen into the
  // useSearchParams / Suspense dance for one string. Read in render after mount; a click wins.
  const mounted = useMounted();
  const venue = useIsVenue();
  // A supplier issues no quote and prints no crew sheet — its documents have nothing to brand.
  const supplier = useIsSupplier();
  const owner = initialMe?.role === "owner";
  const sections = SECTIONS.filter(
    (s) => (!venue || !DESIGNER_ONLY.has(s.id)) && (!supplier || s.id !== "branding") && (owner || !OWNER_ONLY.has(s.id)),
  );
  // Held here, not in the export section: switching sections must not stop a download.
  const exporter = useAccountExport();
  const fromHash = mounted ? window.location.hash.slice(1) : "";
  const [picked, setSection] = useState<SectionId | null>(null);
  const section: SectionId = picked ?? (sections.some((s) => s.id === fromHash) ? (fromHash as SectionId) : "business");

  const go = (id: SectionId) => {
    setSection(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      // non-fatal: the section still switched
    }
  };

  return (
    <div className={`flex items-start gap-3 ${PAGE_GUTTER}`}>
      <nav aria-label="הגדרות" className="sticky top-0 flex w-[228px] shrink-0 flex-col gap-[3px] rounded-md border border-border bg-surface p-2">
        {sections.map(({ id, label, icon: Icon }) => {
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
        {section === "business" && <BusinessSection initialSettings={initialSettings} />}
        {section === "billing" && <BillingSection initialSettings={initialSettings} initialCounters={initialCounters} />}
        {section === "branding" && <BrandingSection initialSettings={initialSettings} />}
        {section === "account" && (
          <AccountSection
            initialMe={initialMe}
            needsPassword={needsPassword}
            studioName={initialSettings.businessName}
            onOpenClose={() => go("close")}
          />
        )}
        {section === "meeting" && <MeetingSection />}
        {section === "checkpoints" && <CheckpointsSection initialOffsets={initialOffsets} />}
        {section === "stages" && <StagesSection initialRules={initialStageRules} />}
        {section === "team" && <TeamSection initialMembers={initialMembers} initialMe={initialMe} emailEnabled={emailEnabled} />}
        {section === "sharing" && <SharingSection initialMembers={initialMembers} initialMe={initialMe} />}
        {section === "calendar" && <CalendarSection initialStatus={initialGoogle} />}
        {section === "export" && <ExportSection exporter={exporter} />}
        {section === "audit" && <AuditSection />}
        {section === "close" && <CloseSection exporter={exporter} />}
      </div>
    </div>
  );
}
