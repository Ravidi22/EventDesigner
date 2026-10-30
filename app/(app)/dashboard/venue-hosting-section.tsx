"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Link2Off, Phone } from "lucide-react";
import { fetchHostingForEvent, unlinkFromVenue } from "@/lib/event-links/actions";
import type { HostingForDesigner } from "@/lib/event-links/types";
import { formatEventDate, type EventSummary } from "@/lib/events/types";
import { DrawerSection, SectionAction } from "./drawer-section";

/**
 * The hall's card for this evening, when the event is linked to a venue's booking (lib/event-links)
 * — every detail the venue holds except its money: the evening's timeline, the head counts and
 * special meals, the menu by dish, the vendors at the door, the hall's manager on the night
 * (2026-10-30, the user: "the designer can see all the details in the event card"). The date, the
 * rooms and the guests on this event FOLLOW the hall's; this section says so.
 */
export function VenueHostingSection({ event, onChanged }: { event: EventSummary; onChanged: () => void }) {
  const [card, setCard] = useState<HostingForDesigner | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void fetchHostingForEvent(event.id)
      .then((c) => live && setCard(c))
      .catch(() => live && setCard(null));
    return () => {
      live = false;
    };
  }, [event.id]);

  if (!card) return null;

  const unlink = async () => {
    await unlinkFromVenue(event.id);
    setCard(null);
    onChanged();
  };

  return (
    <DrawerSection
      title={`מהאולם · ${card.hostName}`}
      action={
        <SectionAction icon={Link2Off} onClick={() => void unlink()}>
          ניתוק
        </SectionAction>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">התאריך, האזורים ומספר האורחים באירוע מתעדכנים מהאולם.</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="מועד">
            {formatEventDate(card.date)}
            {card.time && <span className="nums"> · {card.time}</span>}
            <span className="text-muted"> · {card.slot}</span>
          </Fact>
          <Fact label="אורחים">
            <span className="nums">{card.finalGuests ?? card.guests}</span>
            {card.finalGuests !== undefined && <span className="text-xs text-success-ink"> · כמות סגורה</span>}
            {card.children > 0 && <span className="nums text-muted"> · {card.children} ילדים</span>}
          </Fact>
          {card.zonesLabel && (
            <Fact label="אזורים" wide>
              {card.zonesLabel}
            </Fact>
          )}
          {card.vendorMeals > 0 && (
            <Fact label="מנות ספקים">
              <span className="nums">{card.vendorMeals}</span>
            </Fact>
          )}
          {card.serviceStyle && <Fact label="הגשה">{card.serviceStyle}</Fact>}
          {card.specialMeals.length > 0 && (
            <Fact label="ארוחות מיוחדות" wide>
              {card.specialMeals.map((m) => `${m.label} ${m.count}`).join(" · ")}
              {card.specialNote && <span className="block text-xs text-muted">{card.specialNote}</span>}
            </Fact>
          )}
          {(card.onSiteName || card.hostPhone) && (
            <Fact label="איש קשר באולם" wide>
              <span className="flex flex-wrap items-center gap-x-3">
                {card.onSiteName && <span>{card.onSiteName}</span>}
                {(card.onSitePhone || card.hostPhone) && (
                  <a href={`tel:${(card.onSitePhone || card.hostPhone).replace(/[^\d+]/g, "")}`} dir="ltr" className="nums inline-flex items-center gap-1 text-ink-soft hover:text-accent-hover">
                    <Phone className="h-3.5 w-3.5 text-muted" strokeWidth={1.75} />
                    {card.onSitePhone || card.hostPhone}
                  </a>
                )}
              </span>
            </Fact>
          )}
        </dl>

        {card.runOfShow.length > 0 && (
          <Block title="לו״ז הערב">
            <ol className="space-y-1">
              {card.runOfShow.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="nums w-12 shrink-0 font-semibold text-ink" dir="ltr">
                    {s.time}
                  </span>
                  <span className="text-ink-soft">{s.label}</span>
                </li>
              ))}
            </ol>
          </Block>
        )}

        {card.menu.length > 0 && (
          <Block title="תפריט">
            {card.menu.map((c) => (
              <p key={c.course} className="text-ink-soft">
                <span className="text-xs text-muted">{c.course}: </span>
                {c.dishes.join(" · ")}
              </p>
            ))}
          </Block>
        )}

        {card.vendors.length > 0 && (
          <Block title="ספקים נוספים">
            {card.vendors.map((v, i) => (
              <p key={i} className="text-ink-soft">
                <span className="font-medium text-ink">{v.role}</span> · {v.name}
                {v.arrival && <span className="nums text-muted"> · הגעה {v.arrival}</span>}
                {v.phone && (
                  <a href={`tel:${v.phone.replace(/[^\d+]/g, "")}`} dir="ltr" className="nums ms-2 text-muted hover:text-accent-hover">
                    {v.phone}
                  </a>
                )}
              </p>
            ))}
          </Block>
        )}

        {card.floorNotes && (
          <Block title="הערות האולם">
            <p className="whitespace-pre-line text-ink-soft">{card.floorNotes}</p>
          </Block>
        )}
      </div>
    </DrawerSection>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={"min-w-0 " + (wide ? "col-span-2" : "")}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{children}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1 border-t border-border-soft pt-3">
      <p className="text-xs font-semibold text-muted">{title}</p>
      {children}
    </div>
  );
}
