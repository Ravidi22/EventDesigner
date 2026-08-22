"use client";

import { useEffect, useState } from "react";
import { Building2, Check, Eye, Share2, X } from "lucide-react";
import { useVenues } from "@/lib/venues/use-venues";
import { fetchVenueGrants, revokeGrant, setGrantRole, shareVenue } from "@/lib/venues/actions";
import {
  GRANT_KIND_LABEL,
  SCOPE_LABEL,
  VENUE_ROLE_LABEL,
  VENUE_ROLE_SUMMARY,
  grantScope,
  type GrantKind,
  type GrantScope,
  type VenueGrant,
  type VenueRole,
} from "@/lib/venues/access";
import type { StudioMember } from "@/lib/team/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";
import { Avatar, EMAIL_RE, Note, Panel, RemoveButton, Row } from "./ui";

const VENUE_ROLES: VenueRole[] = ["viewer", "editor", "manager"];
const ROLE_OPTIONS = VENUE_ROLES.map((r) => ({ value: r, label: VENUE_ROLE_LABEL[r] }));
const SCOPE_KEYS: (keyof GrantScope)[] = ["plan", "availability", "events", "money"];

// Sharing a property. The screen exists because a site plan is expensive to draw and a property
// outlives whoever drew it: the second designer working that hall should inherit the wall graph
// instead of tracing it again — while your clients and your prices stay on your side of the line.
export function SharingSection({
  initialMembers,
  initialMe,
}: {
  initialMembers: StudioMember[];
  initialMe: StudioMember | null;
}) {
  // The venue list and the active selection come from VenuesProvider — the same copy the sidebar's
  // switcher is showing. This screen used to fetch its own list and re-resolve the stored id against
  // it, which was a second answer to a question already answered one component up.
  const { venues, activeVenueId } = useVenues();
  const [venueId, setVenueId] = useState<string | null>(activeVenueId);
  const [grants, setGrants] = useState<VenueGrant[]>([]);
  // From page.tsx, shared with the team and account sections.
  const members = initialMembers;
  const me = initialMe;

  const [kind, setKind] = useState<GrantKind>("guest");
  const [memberId, setMemberId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<VenueRole>("viewer");
  const [error, setError] = useState("");

  // Follow the sidebar. `activeVenueId` is already resolved against the list that exists (a stored
  // id naming a deleted property falls back to the first one), so this screen no longer resolves it
  // itself — switching venues in the switcher retargets this panel because the same value changes.
  //
  // It is still local state on top, because the panel has a picker of its own: you can look at one
  // property's share list here without moving the whole app to it.
  const [followingSidebar, setFollowingSidebar] = useState(activeVenueId);
  if (activeVenueId !== followingSidebar) {
    setFollowingSidebar(activeVenueId);
    setVenueId(activeVenueId);
  }

  // The grants are a server read, so retargeting is asynchronous: the selection changes first and
  // the list follows. `live` is what stops a slow answer about the property you just navigated away
  // from landing on the one you are looking at now — the cleanup runs before the next request goes
  // out, so at most one result can ever be adopted.
  useEffect(() => {
    let live = true;
    // A property you may open but not manage still answers here; anything else (it was deleted, it
    // was never yours) leaves the list empty rather than showing the previous venue's people.
    void (venueId ? fetchVenueGrants(venueId) : Promise.resolve([]))
      .then((list) => {
        if (live) setGrants(list);
      })
      .catch(() => {
        if (live) setGrants([]);
      });
    return () => {
      live = false;
    };
  }, [venueId]);

  const pick = (id: string) => {
    setError("");
    setVenueId(id);
  };

  const venue = venues.find((v) => v.id === venueId);
  const granted = new Set(grants.map((g) => g.email.toLowerCase()));
  // You are never in your own share list: your access to this property comes from your role or
  // from the grant you already hold, and the server refuses to write a second one either way.
  const addableMembers = members.filter((m) => m.id !== me?.id && !granted.has(m.email.toLowerCase()));

  const submit = async () => {
    // Nothing to share until a property exists — the panel below already says so, and this keeps a
    // stray Enter from calling shareVenue with no venue.
    if (!venueId) return setError("אין עדיין מתחם לשתף");

    const input =
      kind === "member"
        ? (() => {
            const member = members.find((m) => m.id === memberId);
            // The EMAIL is what identifies a member to the server, which looks the id up itself —
            // a client-supplied user id is exactly the field a hand-made request would forge.
            return member ? { name: member.name, email: member.email } : null;
          })()
        : { name, email: email.trim().toLowerCase() };

    if (!input) return setError("בחרו חבר צוות");
    if (kind === "guest" && !EMAIL_RE.test(input.email)) return setError("כתובת אימייל לא תקינה");

    const result = await shareVenue({ venueId, ...input, kind, role });
    setGrants(result.grants);
    if (result.error) return setError(result.error);

    if (kind === "member") setMemberId("");
    else {
      setName("");
      setEmail("");
    }
    setRole("viewer");
    setError("");
  };

  const scope = grantScope(kind);

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="שיתוף מתחם"
        hint="התוכנית של המתחם היא נכס שמשתלם לשתף — מי שעובד באולם הזה יקבל את הקירות והאזורים שציירתם, בלי לצייר אותם מחדש. האירועים, הלקוחות והמחירים שלכם לא נכללים בשיתוף."
        action={
          <Select
            value={venueId ?? ""}
            onChange={pick}
            options={venues.map((v) => ({ value: v.id, label: v.name }))}
            aria-label="בחירת מתחם"
            className="w-56"
          />
        }
      >
        <div className="mb-5 flex items-center gap-3 rounded-md border border-inset-border bg-inset px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent">
            <Building2 className="h-[18px] w-[18px]" strokeWidth={1.5} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{venue?.name ?? "מתחם"}</p>
            <p className="text-caption text-muted">
              הסטודיו שלכם הוא הבעלים של התוכנית · {grants.length} בעלי גישה
            </p>
          </div>
        </div>

        {grants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            אף אחד לא משותף למתחם הזה עדיין.
          </p>
        ) : (
          <div>
            {grants.map((g) => (
              <Row key={g.id}>
                <Avatar name={g.name} tone={g.kind === "guest" ? "guest" : "member"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{g.name}</p>
                  <p dir="ltr" className="truncate text-end text-caption text-muted">
                    {g.email}
                  </p>
                </div>

                <StatusChip tone={g.kind === "guest" ? "neutral" : "accent"}>{GRANT_KIND_LABEL[g.kind]}</StatusChip>

                {g.status === "pending" && (
                  <span className="text-xs font-medium text-warn-ink">ממתין</span>
                )}

                <Select
                  value={g.role}
                  onChange={(v) => void setGrantRole(g.id, v as VenueRole).then(setGrants)}
                  options={ROLE_OPTIONS}
                  aria-label={`הרשאה — ${g.name}`}
                  className="w-[130px] shrink-0"
                />

                <RemoveButton
                  label={`ביטול גישה — ${g.name}`}
                  onClick={() =>
                    void revokeGrant(g.id)
                      .then(setGrants)
                      // The one refusal a person can actually trigger here is revoking their own
                      // access, which would lock them out of the property they are standing in.
                      .catch(() => setError("אי אפשר לבטל את הגישה של עצמכם"))
                  }
                />
              </Row>
            ))}
          </div>
        )}

        {/* Invite */}
        <div className="mt-5 rounded-md border border-inset-border bg-inset p-4">
          <div className="mb-3 flex items-center gap-1 rounded-md border border-border bg-surface p-1">
            <KindTab
              active={kind === "guest"}
              onClick={() => {
                setKind("guest");
                setError("");
              }}
            >
              אורח מחוץ לסטודיו
            </KindTab>
            <KindTab
              active={kind === "member"}
              onClick={() => {
                setKind("member");
                setError("");
                // Land on a real name rather than an empty trigger the designer has to open.
                if (!addableMembers.some((m) => m.id === memberId)) setMemberId(addableMembers[0]?.id ?? "");
              }}
            >
              חבר צוות
            </KindTab>
          </div>

          {kind === "member" ? (
            addableMembers.length === 0 ? (
              <p className="py-2 text-sm text-muted">כל חברי הצוות כבר קיבלו גישה למתחם הזה.</p>
            ) : (
              <div className="grid grid-cols-[1fr_150px_auto] items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-ink-soft">חבר צוות</span>
                  <Select
                    value={memberId}
                    onChange={(v) => {
                      setMemberId(v);
                      setError("");
                    }}
                    options={addableMembers.map((m) => ({ value: m.id, label: m.name }))}
                    aria-label="חבר צוות"
                  />
                </label>
                <RoleField role={role} onChange={setRole} />
                <ShareButton onClick={() => void submit()} />
              </div>
            )
          ) : (
            <div className="grid grid-cols-[1fr_1fr_150px_auto] items-end gap-3">
              <TextField label="שם" value={name} onChange={setName} placeholder="שם או שם הסטודיו" />
              <TextField
                label="אימייל"
                type="email"
                dir="ltr"
                value={email}
                onChange={(v) => {
                  setEmail(v);
                  setError("");
                }}
                placeholder="name@studio.co.il"
                className="text-end"
                error={Boolean(error)}
              />
              <RoleField role={role} onChange={setRole} />
              <ShareButton onClick={submit} />
            </div>
          )}

          {error && <p className="mt-2 text-xs text-alert">{error}</p>}
          <p className="mt-3 text-xs leading-relaxed text-muted">{VENUE_ROLE_SUMMARY[role]}</p>
        </div>
      </Panel>

      <Panel
        title="מה נמסר עם השיתוף"
        hint={
          kind === "guest"
            ? "אורח הוא מעצב או מנהל אולם מחוץ לסטודיו שלכם."
            : "חבר צוות רואה את העסק לפי התפקיד שלו — השיתוף רק מוסיף לו את המתחם."
        }
      >
        <ul className="flex flex-col gap-2.5">
          {SCOPE_KEYS.map((key) => (
            <li key={key} className="flex items-center gap-2.5 text-sm">
              {scope[key] ? (
                <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-label="נכלל" />
              ) : (
                <X className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} aria-label="לא נכלל" />
              )}
              <span className={scope[key] ? "text-ink-soft" : "text-muted line-through decoration-faint"}>
                {SCOPE_LABEL[key]}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2.5">
          <Note icon={<Eye className="h-4 w-4" strokeWidth={1.6} />}>
            <strong className="font-semibold text-ink">תפוסה אנונימית.</strong> מי שמשותף למתחם רואה
            בגאנט אילו תאריכים תפוסים — ולא את שם האירוע, הלקוח או מה מוצב בו. זו הסיבה המעשית לשתף
            מתחם ולא רק להעביר קובץ: שני מעצבים באותו אולם לא יתחייבו על אותו תאריך.
          </Note>
          <Note icon={<Share2 className="h-4 w-4" strokeWidth={1.6} />}>
            <strong className="font-semibold text-ink">תוכנית אחת.</strong> למתחם יש גרף קירות אחד,
            ולכן הרשאת <span className="font-semibold">עריכה</span> משנה את התוכנית גם אצלכם. תנו
            אותה למי שבאמת מתחזק את המתחם; לשאר עדיפה <span className="font-semibold">צפייה</span>.
          </Note>
        </div>
      </Panel>
    </div>
  );
}

function KindTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-sm px-3 py-2 text-[13px] transition-colors ${
        active ? "bg-accent-tint font-bold text-accent" : "font-semibold text-muted hover:text-ink-soft"
      }`}
    >
      {children}
    </button>
  );
}

function RoleField({ role, onChange }: { role: VenueRole; onChange: (r: VenueRole) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink-soft">הרשאה</span>
      <Select value={role} onChange={(v) => onChange(v as VenueRole)} options={ROLE_OPTIONS} aria-label="הרשאה" />
    </label>
  );
}

function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="pb-0.5">
      <Button size="sm" onClick={onClick}>
        <Share2 className="h-4 w-4" strokeWidth={1.8} />
        שיתוף
      </Button>
    </div>
  );
}
