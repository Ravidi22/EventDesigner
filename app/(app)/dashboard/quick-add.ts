import { Ban, CalendarHeart, Ellipsis, Sparkles } from "lucide-react";
import type { AppointmentKind } from "@/lib/appointments/types";
import { APPOINTMENT_KIND_LABEL } from "@/lib/appointments/types";
import type { MenuItem } from "@/components/menu";
import { KIND_CARD_THEME, KIND_ICON } from "./dashboard-view-utils";

// A DAY'S "+" — ONE MENU FOR BOTH BUSINESSES (2026-11-10, the "Modals & popups" board, 4f). It used
// to be two things: a studio's "+" opened the meeting dialog straight away (the kind then picked
// inside it) and a hall's opened a two-row menu. Now both open this: the frequent kinds as rows in
// their own glyph colour, blocking the day, "other…", and the day's new event — a studio's last
// (it opens the event dialog with the date filled), a hall's FIRST ("אירוע באולם": an evening is a
// hall's main write).

const CLIENT_ROWS: readonly AppointmentKind[] = ["consultation", "followup", "walkthrough", "tasting"];

export function quickAddItems(
  org: "studio" | "venue",
  on: { kind: (k: AppointmentKind) => void; other: () => void; event: () => void },
): MenuItem[] {
  const kinds: MenuItem[] = CLIENT_ROWS.map((k) => ({
    label: APPOINTMENT_KIND_LABEL[k],
    icon: KIND_ICON[k],
    iconClassName: KIND_CARD_THEME[k].text,
    onSelect: () => on.kind(k),
  }));
  const rest: MenuItem[] = [
    {
      label: "חסימת היום",
      icon: Ban,
      iconClassName: KIND_CARD_THEME.constraint.text,
      hint: APPOINTMENT_KIND_LABEL.constraint,
      separated: true,
      onSelect: () => on.kind("constraint"),
    },
    { label: "רשומה אחרת…", icon: Ellipsis, onSelect: on.other },
  ];
  if (org === "venue") {
    return [
      { label: "אירוע באולם", icon: CalendarHeart, emphasis: true, onSelect: on.event },
      { ...kinds[0], separated: true },
      ...kinds.slice(1),
      ...rest,
    ];
  }
  return [...kinds, ...rest, { label: "אירוע חדש בתאריך הזה", icon: Sparkles, emphasis: true, separated: true, onSelect: on.event }];
}

/** The menu's heading — "הוספה ביום ד׳, 18 בנוב׳". */
export function quickAddHeading(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `הוספה ב${d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric", month: "short" })}`;
}
