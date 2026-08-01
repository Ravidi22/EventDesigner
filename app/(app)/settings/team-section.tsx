"use client";

import { useEffect, useState } from "react";
import { Check, Mail, UserPlus, X } from "lucide-react";
import {
  CURRENT_MEMBER_ID,
  DEFAULT_MEMBERS,
  ROLE_CAPABILITIES,
  ROLE_SUMMARY,
  STUDIO_ROLE_LABEL,
  inviteMember,
  loadMembers,
  removeMember,
  updateMember,
  type StudioMember,
  type StudioRole,
} from "@/lib/team/storage";
import { revokeGrantsFor } from "@/lib/venues/access";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";
import { Avatar, EMAIL_RE, Note, Panel, RemoveButton, Row } from "./ui";

const ROLES: StudioRole[] = ["owner", "designer", "crew"];
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: STUDIO_ROLE_LABEL[r] }));

// Membership of the studio — the people who work for this business. Access to a specific property
// is the other section (מתחמים ושיתוף); a designer can be on the team and still reach only the
// two venues they were granted.
export function TeamSection() {
  const [members, setMembers] = useState<StudioMember[]>(DEFAULT_MEMBERS);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StudioRole>("designer");
  const [error, setError] = useState("");

  useEffect(() => setMembers(loadMembers()), []);

  const submit = () => {
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) return setError("כתובת אימייל לא תקינה");
    if (members.some((m) => m.email.toLowerCase() === address)) return setError("הכתובת הזו כבר בצוות");
    setMembers(inviteMember(name, address, role));
    setName("");
    setEmail("");
    setRole("designer");
    setError("");
    setInviting(false);
  };

  // Removing a person drops their venue grants too. The storage modules deliberately don't
  // cascade into each other, so the screen that owns both actions does it explicitly.
  const remove = (member: StudioMember) => {
    setMembers(removeMember(member.id));
    revokeGrantsFor(member.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="צוות הסטודיו"
        hint="אנשים שעובדים בעסק שלכם. הם רואים את הקטלוג ואת האירועים לפי התפקיד — ורק את המתחמים שנתתם להם."
        action={
          !inviting && (
            <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
              <UserPlus className="h-4 w-4" strokeWidth={1.8} />
              הזמנת חבר צוות
            </Button>
          )
        }
      >
        {inviting && (
          <div className="mb-5 rounded-md border border-inset-border bg-inset p-4">
            <div className="grid grid-cols-[1fr_1fr_150px_auto] items-end gap-3">
              <TextField label="שם" value={name} onChange={setName} placeholder="שם מלא" />
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
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink-soft">תפקיד</span>
                <Select value={role} onChange={(v) => setRole(v as StudioRole)} options={ROLE_OPTIONS} aria-label="תפקיד" />
              </label>
              <div className="flex items-center gap-1 pb-0.5">
                <Button size="sm" onClick={submit}>
                  <Mail className="h-4 w-4" strokeWidth={1.8} />
                  שליחה
                </Button>
                <IconButton
                  label="ביטול"
                  onClick={() => {
                    setInviting(false);
                    setError("");
                  }}
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </IconButton>
              </div>
            </div>
            {error && <p className="mt-2 text-xs text-alert">{error}</p>}
            <p className="mt-3 text-xs leading-relaxed text-muted">{ROLE_SUMMARY[role]}</p>
          </div>
        )}

        <div>
          {members.map((m) => {
            const isMe = m.id === CURRENT_MEMBER_ID;
            return (
              <Row key={m.id}>
                <Avatar name={m.name} tone={isMe ? "self" : "member"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">
                    {m.name}
                    {isMe && <span className="ms-2 text-xs font-medium text-quiet">(אני)</span>}
                  </p>
                  {/* dir=ltr renders the address correctly; text-end then pins it back to the
                      row's start, under the name, instead of the far LTR edge. */}
                  <p dir="ltr" className="truncate text-end text-caption text-muted">
                    {m.email}
                  </p>
                </div>

                {m.status === "invited" && (
                  <StatusChip tone="warn" icon={<Mail className="h-3.5 w-3.5" strokeWidth={2} />}>
                    ממתין לאישור
                  </StatusChip>
                )}

                {isMe ? (
                  <span className="w-[150px] shrink-0 pe-3 text-end text-sm font-semibold text-muted">
                    {STUDIO_ROLE_LABEL[m.role]}
                  </span>
                ) : (
                  <Select
                    value={m.role}
                    onChange={(v) => setMembers(updateMember(m.id, { role: v as StudioRole }))}
                    options={ROLE_OPTIONS}
                    aria-label={`תפקיד — ${m.name}`}
                    className="w-[150px] shrink-0"
                  />
                )}

                <RemoveButton
                  label={isMe ? "אי אפשר להסיר את עצמכם" : `הסרה — ${m.name}`}
                  disabled={isMe}
                  onClick={() => remove(m)}
                />
              </Row>
            );
          })}
        </div>

        <Note>
          הסרה של חבר צוות מבטלת גם את הגישה שלו לכל המתחמים ששיתפתם איתו.
        </Note>
      </Panel>

      <Panel title="מה כל תפקיד רואה" hint="התפקיד קובע מה נראה בעסק. המתחמים עצמם נקבעים בנפרד.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-semibold text-muted">
                <th className="py-2 text-start font-semibold">תפקיד</th>
                <th className="px-2 py-2 font-semibold">אירועים</th>
                <th className="px-2 py-2 font-semibold">מחירים</th>
                <th className="px-2 py-2 font-semibold">קטלוג</th>
                <th className="px-2 py-2 font-semibold">ניהול אנשים</th>
                <th className="px-2 py-2 font-semibold">מתחמים</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => {
                const caps = ROLE_CAPABILITIES[r];
                return (
                  <tr key={r} className="border-b border-border-soft last:border-0">
                    <th scope="row" className="py-3 text-start">
                      <span className="block font-semibold text-ink">{STUDIO_ROLE_LABEL[r]}</span>
                      <span className="block text-xs font-normal leading-relaxed text-muted">{ROLE_SUMMARY[r]}</span>
                    </th>
                    <Cell on={caps.events} />
                    <Cell on={caps.money} />
                    <Cell on={caps.catalog} />
                    <Cell on={caps.people} />
                    <td className="px-2 py-3 text-center text-xs font-semibold text-ink-soft">
                      {caps.venues === "all" ? "כל המתחמים" : "לפי הרשאה"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// Glyph, not colour alone — the table has to survive a black-and-white print like every other
// meaningful mark in the system.
function Cell({ on }: { on: boolean }) {
  return (
    <td className="px-2 py-3 text-center">
      {on ? (
        <Check className="inline h-4 w-4 text-success" strokeWidth={2.5} aria-label="כן" />
      ) : (
        <X className="inline h-4 w-4 text-faint" strokeWidth={2} aria-label="לא" />
      )}
    </td>
  );
}
