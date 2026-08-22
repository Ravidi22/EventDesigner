"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, UserPlus, X } from "lucide-react";
import {
  ROLE_CAPABILITIES,
  ROLE_SUMMARY,
  STUDIO_ROLE_LABEL,
  canManagePeople,
  type StudioMember,
  type StudioRole,
} from "@/lib/team/types";
import {
  fetchCurrentMember,
  fetchMembers,
  inviteMember,
  regenerateInvite,
  removeMember,
  setMemberRole,
} from "@/lib/team/actions";
import { Button } from "@/components/button";
import { IconButton } from "@/components/icon-button";
import { Select } from "@/components/select";
import { StatusChip } from "@/components/status-chip";
import { TextField } from "@/components/text-field";
import { Avatar, EMAIL_RE, Note, Panel, RemoveButton, Row } from "./ui";

const ROLES: StudioRole[] = ["owner", "designer", "crew"];
// What may be HANDED OUT. Ownership is not on this list: transferring a studio has consequences an
// invite form cannot carry (billing, and the rule that the owner's row is not removable), and a
// studio with two owners is two people who can remove each other. The legend below still explains
// all three, because the owner is a real rung people need to read about.
const ASSIGNABLE: StudioRole[] = ["designer", "crew"];
const ROLE_OPTIONS = ASSIGNABLE.map((r) => ({ value: r, label: STUDIO_ROLE_LABEL[r] }));

// Membership of the studio — the people who work for this business. Access to a specific property
// is the other section (מתחמים ושיתוף); a designer can be on the team and still reach only the
// two venues they were granted.
export function TeamSection() {
  const [members, setMembers] = useState<StudioMember[]>([]);
  const [me, setMe] = useState<StudioMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StudioRole>("designer");
  const [error, setError] = useState("");
  // The link is returned once, by the call that minted it — the row stores only a hash, so there is
  // no "show it again". Holding it in state is what keeps it on screen until the designer has
  // actually sent it.
  const [invite, setInvite] = useState<{ email: string; url: string } | null>(null);

  useEffect(() => {
    void Promise.all([fetchMembers(), fetchCurrentMember()]).then(([list, current]) => {
      setMembers(list);
      setMe(current);
    });
  }, []);

  // Only the owner may change the studio's people. The server enforces this on every call; hiding
  // the controls here is so a designer is not shown buttons that answer them with an error.
  const canManage = me ? canManagePeople(me.role) : false;

  const submit = async () => {
    const address = email.trim().toLowerCase();
    // Checked here as well as on the server so the common typo answers instantly, without a
    // round trip that ends in the same sentence.
    if (!EMAIL_RE.test(address)) return setError("כתובת אימייל לא תקינה");

    const result = await inviteMember(name, address, role);
    setMembers(result.members);
    if (result.error) return setError(result.error);

    show(address, result.link);
    setName("");
    setEmail("");
    setRole("designer");
    setError("");
    setInviting(false);
  };

  // Nothing mails this. The app has no mail provider (see docs/02 §9), and an invitation nobody can
  // deliver is a row that blocks its own address from signing up — so the link is put in the
  // designer's hands to send the way they already talk to their people.
  const show = (email: string, link?: string) => {
    if (link) setInvite({ email, url: `${window.location.origin}${link}` });
  };

  const newLink = async (member: StudioMember) => {
    const result = await regenerateInvite(member.id);
    setMembers(result.members);
    if (result.error) return setError(result.error);
    show(member.email, result.link);
  };

  // Their venue grants go with them — the foreign key on venue_grants cascades, so there is no
  // second call to forget here any more.
  const remove = async (member: StudioMember) => setMembers(await removeMember(member.id));

  const changeRole = async (id: string, next: StudioRole) => setMembers(await setMemberRole(id, next));

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="צוות הסטודיו"
        hint="אנשים שעובדים בעסק שלכם. הם רואים את הקטלוג ואת האירועים לפי התפקיד — ורק את המתחמים שנתתם להם."
        action={
          canManage &&
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
                <Button size="sm" onClick={() => void submit()}>
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

        {invite && <InviteLink invite={invite} onDone={() => setInvite(null)} />}

        <div>
          {members.map((m) => {
            const isMe = m.id === me?.id;
            // The owner's own row keeps its label rather than a select: their role is not on the
            // assignable list, so a dropdown here would offer to demote the studio's owner to
            // designer and then be refused by the server.
            const editable = canManage && !isMe && m.role !== "owner";
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
                  <>
                    <StatusChip tone="warn" icon={<Mail className="h-3.5 w-3.5" strokeWidth={2} />}>
                      ממתין לאישור
                    </StatusChip>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => void newLink(m)}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-tint"
                      >
                        <Link2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                        קישור חדש
                      </button>
                    )}
                  </>
                )}

                {editable ? (
                  <Select
                    value={m.role}
                    onChange={(v) => void changeRole(m.id, v as StudioRole)}
                    options={ROLE_OPTIONS}
                    aria-label={`תפקיד — ${m.name}`}
                    className="w-[150px] shrink-0"
                  />
                ) : (
                  <span className="w-[150px] shrink-0 pe-3 text-end text-sm font-semibold text-muted">
                    {STUDIO_ROLE_LABEL[m.role]}
                  </span>
                )}

                <RemoveButton
                  label={isMe ? "אי אפשר להסיר את עצמכם" : `הסרה — ${m.name}`}
                  disabled={!editable}
                  onClick={() => void remove(m)}
                />
              </Row>
            );
          })}
        </div>

        <Note>
          הסרה של חבר צוות מבטלת גם את הגישה שלו לכל המתחמים ששיתפתם איתו.
          {!canManage && " רק בעלי הסטודיו מזמינים אנשים ומשנים תפקידים."}
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

/**
 * The invitation link, and the two ways it actually gets sent.
 *
 * This panel is the delivery mechanism — there is no email provider in the app, on purpose. It
 * stays until dismissed rather than flashing, because the one thing that must not happen is the
 * designer navigating away with the link unsent: the row is already written, the address is already
 * blocked from signing up on its own, and the token cannot be shown again (only replaced).
 */
function InviteLink({ invite, onDone }: { invite: { email: string; url: string }; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be refused (an insecure origin, a locked-down browser). The field
      // below is selectable text for exactly this case, so there is nothing to recover from.
    }
  };

  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`הוזמנתם להצטרף לסטודיו ב-Eve. הקישור להצטרפות: ${invite.url}`)}`;

  return (
    <div className="mb-5 rounded-md border border-accent-line bg-accent-tint/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">ההזמנה מוכנה — שלחו את הקישור</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            שלחו אותו ל־<span dir="ltr" className="font-semibold">{invite.email}</span>. הקישור תקף
            שבועיים, ומוצג פעם אחת בלבד — אם יאבד, אפשר להנפיק חדש מהשורה שלהם ברשימה.
          </p>
        </div>
        <IconButton label="סגירה" onClick={onDone}>
          <X className="h-4 w-4" strokeWidth={2} />
        </IconButton>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          readOnly
          dir="ltr"
          value={invite.url}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="קישור ההזמנה"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-start text-xs text-ink-soft"
        />
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4 text-success" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={1.8} />}
          {copied ? "הועתק" : "העתקה"}
        </Button>
        <a
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-bold text-canvas transition-colors hover:bg-accent-hover"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={1.8} />
          וואטסאפ
        </a>
      </div>
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
